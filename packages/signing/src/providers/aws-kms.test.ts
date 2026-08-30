import { createPublicKey, sign, type KeyObject } from 'node:crypto';
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { algorithmOf } from '../keys';
import { verifyJws } from '../verify';
import { createAwsKmsSigner, type AwsKmsClient, type AwsSigningAlgorithm } from './aws-kms';
import { generateLocalKeyPair } from './local';

const KEY_ARN = 'arn:aws:kms:eu-west-1:123456789012:key/9d8e7c6b-5a43-4210-9f8e-7d6c5b4a3210';

/** Something only the injected client holds, so a leak of it is unmistakable. */
const CLIENT_MARKER = 'aws-client-must-never-be-printed';

/** What each key spec answers with, and what the request for it must say. */
const EXPECTED = {
    ES256: 'ECDSA_SHA_256',
    EdDSA: 'ED25519_SHA_512',
} as const satisfies Record<string, AwsSigningAlgorithm>;

/**
 * A KMS that signs the way the real one does for the key it was given.
 *
 * ECC_NIST_P256 answers in DER; ECC_NIST_EDWARDS25519 answers with the 64 raw
 * bytes of a PureEdDSA signature over the message itself.
 */
function stubClient(privateKey: KeyObject, signature?: Buffer, keySpec?: string): AwsKmsClient
{
    const alg = algorithmOf(privateKey);

    return {
        async sign({ Message, MessageType, SigningAlgorithm })
        {
            expect(MessageType).toBe('RAW');
            expect(SigningAlgorithm).toBe(EXPECTED[alg]);

            const message = Buffer.from(Message);

            return {
                Signature: signature ?? (alg === 'EdDSA'
                    ? sign(null, message, privateKey)
                    : sign('sha256', message, privateKey)),
            };
        },

        async getPublicKey()
        {
            return {
                PublicKey: createPublicKey(privateKey).export({ type: 'spki', format: 'der' }),
                KeySpec: keySpec,
            };
        },
    };
}

describe('AwsKmsSigner', () =>
{
    it('A1: converts the DER signature an ES256 key returns into JOSE r || s', async () =>
    {
        const { privateKey } = generateLocalKeyPair('ES256');
        const signer = await createAwsKmsSigner({ keyId: KEY_ARN, client: stubClient(privateKey) });

        const token = await signer.sign({ sub: 'tenant-1' });

        expect(signer.alg).toBe('ES256');
        expect(Buffer.from(token.split('.')[2], 'base64url')).toHaveLength(64);
        expect(verifyJws(token, [await signer.publicKey()]).ok).toBe(true);
    });

    it("A2': signs EdDSA with ED25519_SHA_512 over the raw message", async () =>
    {
        const { privateKey } = generateLocalKeyPair('EdDSA');
        const signer = await createAwsKmsSigner({ keyId: KEY_ARN, client: stubClient(privateKey) });

        const token = await signer.sign({ sub: 'tenant-1' });

        // The stub asserts the request; this asserts what came back is usable
        // as-is — a PureEdDSA signature is already JOSE's 64 bytes, not DER.
        expect(signer.alg).toBe('EdDSA');
        expect(Buffer.from(token.split('.')[2], 'base64url')).toHaveLength(64);
        expect(verifyJws(token, [await signer.publicKey()]).ok).toBe(true);
    });

    it('A3: takes its kid from an ARN or an alias, and lets you override it', async () =>
    {
        const client = stubClient(generateLocalKeyPair('ES256').privateKey);
        const ids = {
            [KEY_ARN]: '9d8e7c6b-5a43-4210-9f8e-7d6c5b4a3210',
            'alias/spfn-bridge': 'spfn-bridge',
            'arn:aws:kms:eu-west-1:123456789012:alias/spfn-bridge': 'spfn-bridge',
            '9d8e7c6b-5a43-4210-9f8e-7d6c5b4a3210': '9d8e7c6b-5a43-4210-9f8e-7d6c5b4a3210',
        };

        for (const [keyId, kid] of Object.entries(ids))
        {
            expect((await createAwsKmsSigner({ keyId, client })).kid, keyId).toBe(kid);
        }

        expect((await createAwsKmsSigner({ keyId: KEY_ARN, client, kid: 'bridge-2026-08' })).kid)
            .toBe('bridge-2026-08');
    });

    it('A4: refuses an Ed25519 signature that is not 64 bytes', async () =>
    {
        const { privateKey } = generateLocalKeyPair('EdDSA');
        const short = sign(null, Buffer.from('x'), privateKey).subarray(0, 63);
        const signer = await createAwsKmsSigner({
            keyId: KEY_ARN,
            client: stubClient(privateKey, short),
        });

        await expect(signer.sign({ sub: 'tenant-1' }))
            .rejects.toThrow(/expected a 64-byte Ed25519 signature, got 63/);
    });

    it('A6: refuses a KeySpec that contradicts the public key it came with', async () =>
    {
        const contradictions = [
            { alg: 'ES256', keySpec: 'ECC_NIST_EDWARDS25519' },
            { alg: 'EdDSA', keySpec: 'ECC_NIST_P256' },
            // A spec for a key this package does not sign with at all.
            { alg: 'ES256', keySpec: 'RSA_2048' },
        ] as const;

        for (const { alg, keySpec } of contradictions)
        {
            const client = stubClient(generateLocalKeyPair(alg).privateKey, undefined, keySpec);

            await expect(createAwsKmsSigner({ keyId: KEY_ARN, client }), keySpec)
                .rejects.toThrow(new RegExp(`KeySpec ${keySpec} but its public key is an ${alg} key`));
        }
    });

    it('A6: accepts a KeySpec that agrees, and its absence — the field is optional', async () =>
    {
        const specs = [
            { alg: 'ES256', keySpec: 'ECC_NIST_P256' },
            { alg: 'EdDSA', keySpec: 'ECC_NIST_EDWARDS25519' },
        ] as const;

        for (const { alg, keySpec } of specs)
        {
            for (const spec of [keySpec, undefined])
            {
                const client = stubClient(generateLocalKeyPair(alg).privateKey, undefined, spec);
                const signer = await createAwsKmsSigner({ keyId: KEY_ARN, client });

                expect(signer.alg, `${alg} ${spec}`).toBe(alg);
                expect(verifyJws(await signer.sign({ sub: 'a' }), [await signer.publicKey()]).ok)
                    .toBe(true);
            }
        }
    });

    it('A5: never renders its client, whatever formats it', async () =>
    {
        const client = stubClient(generateLocalKeyPair('EdDSA').privateKey);

        // An injected client is the reachable case: the SDK path wraps the real
        // KMSClient in closures, and a caller's client has no such protection.
        (client as unknown as Record<string, unknown>).credentials = { nested: { CLIENT_MARKER } };

        const signer = await createAwsKmsSigner({ keyId: KEY_ARN, client, kid: 'bridge' });

        expect(Object.keys(signer)).not.toContain('client');
        expect(signer.toString()).toBe('AwsKmsSigner(bridge, EdDSA)');
        expect(inspect(signer, { depth: 6 })).toBe('AwsKmsSigner(bridge, EdDSA)');
        expect(inspect(signer, { depth: 6 })).not.toContain(CLIENT_MARKER);
    });

    it('refuses a key whose algorithm is not the one that was asked for', async () =>
    {
        const client = stubClient(generateLocalKeyPair('EdDSA').privateKey);

        await expect(createAwsKmsSigner({ keyId: KEY_ARN, alg: 'ES256', client }))
            .rejects.toThrow(/is an EdDSA key, not ES256/);
    });

    it('refuses a signing input larger than the 4 KiB KMS takes, on either algorithm', async () =>
    {
        for (const alg of ['ES256', 'EdDSA'] as const)
        {
            const client = stubClient(generateLocalKeyPair(alg).privateKey);
            const signer = await createAwsKmsSigner({ keyId: KEY_ARN, alg, client });

            await expect(signer.sign({ blob: 'x'.repeat(5000) }), alg)
                .rejects.toThrow(/KMS takes at most 4096/);
        }
    });
});
