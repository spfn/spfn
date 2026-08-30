import { createPublicKey, sign, type KeyObject } from 'node:crypto';
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { verifyJws } from '../verify';
import { createGcpKmsSigner, type GcpKmsClient } from './gcp-kms';
import { generateLocalKeyPair } from './local';

const KEY_NAME = 'projects/p/locations/global/keyRings/r/cryptoKeys/bridge';
const VERSION = `${KEY_NAME}/cryptoKeyVersions/7`;

/** Something only the injected client holds, so a leak of it is unmistakable. */
const CLIENT_MARKER = 'gcp-client-must-never-be-printed';

/**
 * CRC32C computed the slow way, so the provider's table-driven one is checked
 * against something other than itself.
 */
function crc32c(data: Buffer): number
{
    let crc = 0xffffffff;

    for (const byte of data)
    {
        crc ^= byte;

        for (let bit = 0; bit < 8; bit += 1)
        {
            crc = crc & 1 ? (crc >>> 1) ^ 0x82f63b78 : crc >>> 1;
        }
    }

    return (crc ^ 0xffffffff) >>> 0;
}

interface StubOptions
{
    /** Corrupt the signature checksum the way a broken transport would. */
    breakSignatureCrc?: boolean;
    verifiedDataCrc32c?: boolean;
    /** Add a `pemCrc32c` to the public key response; `'wrong'` corrupts it. */
    pemCrc32c?: 'right' | 'wrong';
    /** Send exactly this as `pemCrc32c`, whatever shape it is. */
    rawPemCrc32c?: unknown;
    /** Answer `getPublicKey` with a name other than the version asked for. */
    publicKeyName?: string;
    /** Answer with the public half of this key instead of the signing key's. */
    pemFrom?: KeyObject;
}

/** The `pemCrc32c` member of the response, exactly as the test asked for it. */
function pemCrc32cField(options: StubOptions, correct: number): { pemCrc32c?: string }
{
    if ('rawPemCrc32c' in options)
    {
        return { pemCrc32c: options.rawPemCrc32c as string };
    }

    if (options.pemCrc32c === undefined)
    {
        return {};
    }

    return { pemCrc32c: String(correct + (options.pemCrc32c === 'wrong' ? 1 : 0)) };
}

function stubClient(
    privateKey: KeyObject,
    kmsAlgorithm: string,
    options: StubOptions = {},
): GcpKmsClient
{
    const publicPem = createPublicKey(options.pemFrom ?? privateKey)
        .export({ type: 'spki', format: 'pem' }) as string;
    const pemCrc = crc32c(Buffer.from(publicPem, 'utf8'));

    return {
        async getPublicKey({ name })
        {
            expect(name).toBe(VERSION);

            return [{
                pem: publicPem,
                algorithm: kmsAlgorithm,
                name: options.publicKeyName ?? name,
                ...pemCrc32cField(options, pemCrc),
            }];
        },

        async asymmetricSign({ name, data, dataCrc32c })
        {
            // The provider must checksum what it sends, or KMS cannot verify it.
            expect(dataCrc32c.value).toBe(String(crc32c(data)));

            const signature = kmsAlgorithm.includes('ED25519')
                ? sign(null, data, privateKey)
                : sign('sha256', data, privateKey);

            return [{
                name,
                signature,
                signatureCrc32c: String(crc32c(signature) + (options.breakSignatureCrc ? 1 : 0)),
                verifiedDataCrc32c: options.verifiedDataCrc32c ?? true,
            }];
        },

        async listCryptoKeyVersions({ parent })
        {
            expect(parent).toBe(KEY_NAME);

            return [[
                { name: `${KEY_NAME}/cryptoKeyVersions/3`, state: 'ENABLED' },
                { name: VERSION, state: 'ENABLED' },
            ]];
        },
    };
}

describe('GcpKmsSigner', () =>
{
    it('G1: converts the DER signature of an EC key and passes an Ed25519 one through', async () =>
    {
        const cases = [
            { alg: 'ES256', kmsAlgorithm: 'EC_SIGN_P256_SHA256' },
            { alg: 'EdDSA', kmsAlgorithm: 'EC_SIGN_ED25519' },
        ] as const;

        for (const { alg, kmsAlgorithm } of cases)
        {
            const { privateKey } = generateLocalKeyPair(alg);
            const signer = await createGcpKmsSigner({
                keyVersionName: VERSION,
                client: stubClient(privateKey, kmsAlgorithm),
            });

            expect(signer.alg).toBe(alg);

            const token = await signer.sign({ sub: 'tenant-1' });

            expect(Buffer.from(token.split('.')[2], 'base64url')).toHaveLength(64);
            expect(verifyJws(token, [await signer.publicKey()]).ok).toBe(true);
        }
    });

    it('G2: refuses a response whose checksums do not add up', async () =>
    {
        const { privateKey } = generateLocalKeyPair('ES256');
        const corrupt = await createGcpKmsSigner({
            keyVersionName: VERSION,
            client: stubClient(privateKey, 'EC_SIGN_P256_SHA256', { breakSignatureCrc: true }),
        });

        await expect(corrupt.sign({ sub: 'a' })).rejects.toThrow(/signature checksum/);

        const unverified = await createGcpKmsSigner({
            keyVersionName: VERSION,
            client: stubClient(privateKey, 'EC_SIGN_P256_SHA256', { verifiedDataCrc32c: false }),
        });

        await expect(unverified.sign({ sub: 'a' })).rejects.toThrow(/request checksum/);
    });

    it('G3: takes its kid from the key version segment, unless told otherwise', async () =>
    {
        const { privateKey } = generateLocalKeyPair('ES256');
        const client = stubClient(privateKey, 'EC_SIGN_P256_SHA256');

        expect((await createGcpKmsSigner({ keyVersionName: VERSION, client })).kid).toBe('7');
        expect((await createGcpKmsSigner({ keyVersionName: VERSION, client, kid: 'bridge-v7' })).kid)
            .toBe('bridge-v7');
    });

    it('resolves the newest enabled version when given the key rather than the version', async () =>
    {
        const { privateKey } = generateLocalKeyPair('ES256');
        const signer = await createGcpKmsSigner({
            keyName: KEY_NAME,
            client: stubClient(privateKey, 'EC_SIGN_P256_SHA256'),
        });

        expect(signer.keyVersionName).toBe(VERSION);
    });

    it('G8: accepts the two Cloud KMS enums by name and refuses every other', async () =>
    {
        const { privateKey } = generateLocalKeyPair('ES256');
        // Not a substring match: `ED25519` on its own, and the pre-hashed
        // variant, are strings Cloud KMS never sends for a key this signs with.
        const unsupported = [
            'RSA_SIGN_PKCS1_2048_SHA256',
            'ED25519',
            'EC_SIGN_ED25519_PH',
            'EC_SIGN_SECP256K1_SHA256',
            'constructor',
        ];

        for (const kmsAlgorithm of unsupported)
        {
            await expect(createGcpKmsSigner({
                keyVersionName: VERSION,
                client: stubClient(privateKey, kmsAlgorithm),
            }), kmsAlgorithm).rejects.toThrow(new RegExp(`${kmsAlgorithm} is not supported`));
        }
    });

    it('G10: refuses an EC_SIGN_ED25519 label over a P-256 public key', async () =>
    {
        const { privateKey } = generateLocalKeyPair('EdDSA');

        await expect(createGcpKmsSigner({
            keyVersionName: VERSION,
            client: stubClient(privateKey, 'EC_SIGN_ED25519', {
                pemFrom: generateLocalKeyPair('ES256').privateKey,
            }),
        })).rejects.toThrow(/labelled EC_SIGN_ED25519 \(EdDSA\) but its public key is ES256/);
    });

    it('G11: refuses an EC_SIGN_P256_SHA256 label over an Ed25519 public key', async () =>
    {
        const { privateKey } = generateLocalKeyPair('ES256');

        await expect(createGcpKmsSigner({
            keyVersionName: VERSION,
            client: stubClient(privateKey, 'EC_SIGN_P256_SHA256', {
                pemFrom: generateLocalKeyPair('EdDSA').privateKey,
            }),
        })).rejects.toThrow(/labelled EC_SIGN_P256_SHA256 \(ES256\) but its public key is EdDSA/);
    });

    it('G4: refuses a public key whose pemCrc32c does not match the PEM', async () =>
    {
        const { privateKey } = generateLocalKeyPair('ES256');

        await expect(createGcpKmsSigner({
            keyVersionName: VERSION,
            client: stubClient(privateKey, 'EC_SIGN_P256_SHA256', { pemCrc32c: 'wrong' }),
        })).rejects.toThrow(/public key checksum/);
    });

    it('G5: refuses a public key that came from another key version', async () =>
    {
        const { privateKey } = generateLocalKeyPair('ES256');
        const impostor = `${KEY_NAME}/cryptoKeyVersions/6`;

        await expect(createGcpKmsSigner({
            keyVersionName: VERSION,
            client: stubClient(privateKey, 'EC_SIGN_P256_SHA256', { publicKeyName: impostor }),
        })).rejects.toThrow(new RegExp(`came from ${impostor}, not ${VERSION}`));
    });

    it('G6: accepts a matching pemCrc32c, and its absence — the field is optional', async () =>
    {
        const { privateKey } = generateLocalKeyPair('ES256');

        for (const pemCrc32c of ['right', undefined] as const)
        {
            const signer = await createGcpKmsSigner({
                keyVersionName: VERSION,
                client: stubClient(privateKey, 'EC_SIGN_P256_SHA256', { pemCrc32c }),
            });

            expect(verifyJws(await signer.sign({ sub: 'a' }), [await signer.publicKey()]).ok)
                .toBe(true);
        }
    });

    it('G9: refuses a pemCrc32c that is present but cannot be read', async () =>
    {
        const { privateKey } = generateLocalKeyPair('ES256');
        // The corruption this check exists for can reach the checksum field as
        // easily as the PEM, so an unreadable checksum is the case it must fire
        // on — not the case it stands down for. Only a genuinely absent field
        // is a skip, and G6 covers that.
        const unreadable = [{ value: 'corrupted' }, {}, 'corrupted', { value: undefined }, NaN];

        for (const rawPemCrc32c of unreadable)
        {
            await expect(createGcpKmsSigner({
                keyVersionName: VERSION,
                client: stubClient(privateKey, 'EC_SIGN_P256_SHA256', { rawPemCrc32c }),
            }), inspect(rawPemCrc32c)).rejects.toThrow(/pemCrc32c is present but is not a checksum/);
        }
    });

    it('G7: never renders its client, whatever formats it', async () =>
    {
        const { privateKey } = generateLocalKeyPair('ES256');
        const client = stubClient(privateKey, 'EC_SIGN_P256_SHA256');

        // A real client reaches its GoogleAuth state and the credentials in it,
        // so anything that walks the signer's own properties walks into those.
        (client as unknown as Record<string, unknown>).credentials = { nested: { CLIENT_MARKER } };

        const signer = await createGcpKmsSigner({ keyVersionName: VERSION, client });

        expect(Object.keys(signer)).not.toContain('client');
        expect(signer.toString()).toBe('GcpKmsSigner(7, ES256)');
        expect(inspect(signer, { depth: 6 })).toBe('GcpKmsSigner(7, ES256)');
        expect(inspect(signer, { depth: 6 })).not.toContain(CLIENT_MARKER);
    });

    it('describes itself without a client or a key', async () =>
    {
        const { privateKey } = generateLocalKeyPair('ES256');
        const signer = await createGcpKmsSigner({
            keyVersionName: VERSION,
            client: stubClient(privateKey, 'EC_SIGN_P256_SHA256'),
        });

        expect(JSON.parse(JSON.stringify(signer))).toEqual({
            provider: 'gcp-kms',
            kid: '7',
            alg: 'ES256',
            keyVersionName: VERSION,
        });
    });
});
