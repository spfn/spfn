import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { encodeBase64Url } from '../jws';
import { algorithmOf, publicKeyToJwk, rawPublicKey } from '../keys';
import { verifyJws } from '../verify';
import { generateLocalKeyPair, LocalSigner } from './local';

const scratch = mkdtempSync(join(tmpdir(), 'spfn-signing-'));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** The 32-byte Ed25519 seed inside a PKCS#8 export. */
function ed25519Seed(privateKey: Parameters<typeof publicKeyToJwk>[0]): Buffer
{
    return Buffer.from(privateKey.export({ format: 'jwk' }).d as string, 'base64url');
}

describe('LocalSigner', () =>
{
    it('L1: takes an Ed25519 seed from a named environment variable', async () =>
    {
        const { privateKey, publicKey } = generateLocalKeyPair('EdDSA');

        process.env.SPFN_TEST_SIGNING_KEY = encodeBase64Url(ed25519Seed(privateKey));

        try
        {
            const signer = new LocalSigner({
                kid: 'ed-1',
                alg: 'EdDSA',
                privateKey: { env: 'SPFN_TEST_SIGNING_KEY' },
            });

            expect(verifyJws(await signer.sign({ sub: 'a' }), [await signer.publicKey()]).ok).toBe(true);
            expect(rawPublicKey((await signer.publicKey()).public).equals(rawPublicKey(publicKey)))
                .toBe(true);
        }
        finally
        {
            delete process.env.SPFN_TEST_SIGNING_KEY;
        }
    });

    it('L2: takes a PKCS#8 PEM from a file, and DER from one too', async () =>
    {
        const { privateKey } = generateLocalKeyPair('ES256');
        const pem = join(scratch, 'key.pem');
        const der = join(scratch, 'key.der');

        writeFileSync(pem, privateKey.export({ type: 'pkcs8', format: 'pem' }));
        writeFileSync(der, privateKey.export({ type: 'pkcs8', format: 'der' }));

        for (const file of [pem, der])
        {
            const signer = new LocalSigner({ kid: 'es-1', alg: 'ES256', privateKey: { file } });

            expect(verifyJws(await signer.sign({ sub: 'a' }), [await signer.publicKey()]).ok).toBe(true);
        }
    });

    it('L3: names the environment variable or the file it could not read, and nothing else', () =>
    {
        const secret = encodeBase64Url(ed25519Seed(generateLocalKeyPair('EdDSA').privateKey));
        const missing = join(scratch, 'absent.pem');

        delete process.env.SPFN_TEST_ABSENT_KEY;

        const failures = [
            attempt(() => new LocalSigner({
                kid: 'k', alg: 'EdDSA', privateKey: { env: 'SPFN_TEST_ABSENT_KEY' },
            })),
            attempt(() => new LocalSigner({ kid: 'k', alg: 'EdDSA', privateKey: { file: missing } })),
        ];

        expect(failures[0]).toContain('SPFN_TEST_ABSENT_KEY');
        expect(failures[1]).toContain(missing);

        // The value never travels with the complaint.
        process.env.SPFN_TEST_BAD_KEY = `${secret}!!`;

        try
        {
            const message = attempt(() => new LocalSigner({
                kid: 'k', alg: 'EdDSA', privateKey: { env: 'SPFN_TEST_BAD_KEY' },
            }));

            expect(message).toContain('SPFN_TEST_BAD_KEY');
            expect(message).not.toContain(secret);
        }
        finally
        {
            delete process.env.SPFN_TEST_BAD_KEY;
        }
    });

    it('L4: derives the public key from a raw 32-byte P-256 scalar', async () =>
    {
        const { privateKey, publicKey } = generateLocalKeyPair('ES256');
        const scalar = Buffer.from(privateKey.export({ format: 'jwk' }).d as string, 'base64url');

        expect(scalar).toHaveLength(32);

        const signer = new LocalSigner({ kid: 'es-1', alg: 'ES256', privateKey: scalarKey(scalar) });
        const entry = await signer.publicKey();

        expect(publicKeyToJwk(entry.public)).toEqual(publicKeyToJwk(publicKey));
        expect(verifyJws(await signer.sign({ sub: 'a' }), [entry]).ok).toBe(true);
    });

    it('L4: refuses a key whose algorithm is not the one declared', () =>
    {
        const { privateKey } = generateLocalKeyPair('EdDSA');

        expect(() => new LocalSigner({ kid: 'k', alg: 'ES256', privateKey }))
            .toThrow(/is an EdDSA key, not ES256/);
    });

    it('L6: signs Ed25519 when no algorithm is named', async () =>
    {
        const { privateKey } = generateLocalKeyPair();
        const signer = new LocalSigner({ kid: 'default-1', privateKey });

        expect(signer.alg).toBe('EdDSA');
        expect(algorithmOf(privateKey)).toBe('EdDSA');
        expect(verifyJws(await signer.sign({ sub: 'a' }), [await signer.publicKey()]).ok).toBe(true);
    });

    it('L6: reads a bare 32-byte key as an Ed25519 seed when no algorithm is named', async () =>
    {
        const { privateKey, publicKey } = generateLocalKeyPair();
        const signer = new LocalSigner({
            kid: 'default-2',
            privateKey: scalarKey(ed25519Seed(privateKey)),
        });

        expect(publicKeyToJwk((await signer.publicKey()).public)).toEqual(publicKeyToJwk(publicKey));
    });

    it('L5: never shows the key material when it describes itself', () =>
    {
        const { privateKey } = generateLocalKeyPair('ES256');
        const secret = privateKey.export({ format: 'jwk' }).d as string;
        const signer = new LocalSigner({ kid: 'es-1', alg: 'ES256', privateKey });

        const descriptions = [
            inspect(signer),
            inspect({ signer }, { depth: 10 }),
            JSON.stringify(signer),
            JSON.stringify({ config: { signer } }),
            String(signer),
            `${signer}`,
        ];

        for (const description of descriptions)
        {
            expect(description).not.toContain(secret);
            expect(description).toContain('es-1');
        }

        expect(JSON.parse(JSON.stringify(signer)))
            .toEqual({ provider: 'local', kid: 'es-1', alg: 'ES256' });
        expect(Object.keys(signer)).toEqual(['kid', 'alg', 'provider']);
    });
});

/** A raw scalar, as a caller would pass it: from an environment variable. */
function scalarKey(scalar: Buffer): { env: string }
{
    process.env.SPFN_TEST_SCALAR_KEY = encodeBase64Url(scalar);

    return { env: 'SPFN_TEST_SCALAR_KEY' };
}

function attempt(action: () => unknown): string
{
    try
    {
        action();
    }
    catch (error)
    {
        return error instanceof Error ? error.message : String(error);
    }

    throw new Error('expected a failure');
}
