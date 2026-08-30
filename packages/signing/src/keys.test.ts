import { createPublicKey } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encodeBase64Url } from './jws';
import {
    formatPublicKeyEntry,
    parsePublicKeyEntry,
    parsePublicKeys,
    publicKeyToJwk,
    rawPublicKey,
    toJwks,
} from './keys';
import { generateLocalKeyPair } from './providers/local';
import { equivalentFinalCharacters } from './test-support';

function entryText(kid: string, bytes: Buffer): string
{
    return `${kid}:${encodeBase64Url(bytes)}`;
}

/** The 33-byte compressed form of a P-256 point: 0x02/0x03 || X. */
function compressPoint(uncompressed: Buffer): Buffer
{
    const x = uncompressed.subarray(1, 33);
    const y = uncompressed.subarray(33);

    return Buffer.concat([Buffer.from([y[y.length - 1] & 1 ? 0x03 : 0x02]), x], 33);
}

describe('keys', () =>
{
    it('K1: reads a raw 32-byte Ed25519 key and refuses 31 or 33 bytes', () =>
    {
        const { publicKey } = generateLocalKeyPair('EdDSA');
        const raw = rawPublicKey(publicKey);

        expect(raw).toHaveLength(32);

        const entry = parsePublicKeyEntry(entryText('ed-1', raw));

        expect(entry.alg).toBe('EdDSA');
        expect(entry.kid).toBe('ed-1');
        expect(rawPublicKey(entry.public).equals(raw)).toBe(true);

        expect(() => parsePublicKeyEntry(entryText('ed-1', raw.subarray(0, 31))))
            .toThrow(/31 bytes/);
        expect(() => parsePublicKeyEntry(entryText('ed-1', Buffer.concat([raw, Buffer.from([0])]))))
            .toThrow(/33 bytes/);
    });

    it('K2: reads a SEC1 uncompressed P-256 point and SPKI DER, and refuses a compressed point', () =>
    {
        const { publicKey } = generateLocalKeyPair('ES256');
        const point = rawPublicKey(publicKey);
        const spki = publicKey.export({ type: 'spki', format: 'der' });

        expect(point).toHaveLength(65);
        expect(point[0]).toBe(0x04);

        for (const encoding of [point, spki])
        {
            const entry = parsePublicKeyEntry(entryText('es-1', encoding));

            expect(entry.alg).toBe('ES256');
            expect(publicKeyToJwk(entry.public)).toEqual(publicKeyToJwk(publicKey));
        }

        // Documented refusal: 33 bytes is a compressed point and a mistyped
        // Ed25519 key at the same time, so the format does not accept it.
        expect(() => parsePublicKeyEntry(entryText('es-1', compressPoint(point))))
            .toThrow(/33 bytes/);
    });

    it('K3: refuses a kid containing a colon or whitespace', () =>
    {
        const { publicKey } = generateLocalKeyPair('EdDSA');
        const raw = encodeBase64Url(rawPublicKey(publicKey));

        for (const kid of ['ns:key', 'my key', 'key\t2', 'key\n', ''])
        {
            expect(() => parsePublicKeyEntry(`${kid}:${raw}`), kid).toThrow(/Invalid kid/);
        }
    });

    it('K4: exports the JWK node:crypto exports', () =>
    {
        for (const alg of ['ES256', 'EdDSA'] as const)
        {
            const { publicKey } = generateLocalKeyPair(alg);
            const entry = parsePublicKeyEntry(formatPublicKeyEntry({ kid: 'k', alg, public: publicKey }));
            // The same key by an unrelated route: PEM in, JWK out.
            const independent = createPublicKey(publicKey.export({ type: 'spki', format: 'pem' }));

            expect(publicKeyToJwk(entry.public)).toEqual(independent.export({ format: 'jwk' }));
        }
    });

    it('K5: refuses a key whose base64url is not canonical', () =>
    {
        const { publicKey } = generateLocalKeyPair('EdDSA');
        const raw = encodeBase64Url(rawPublicKey(publicKey));
        // 32 bytes take 43 characters, two bits of which encode nothing: three
        // other strings would parse to this very same key.
        const alternatives = equivalentFinalCharacters(raw);

        expect(alternatives).toHaveLength(3);
        expect(parsePublicKeyEntry(`ed-1:${raw}`).kid).toBe('ed-1');

        for (const character of alternatives)
        {
            const mutated = `ed-1:${raw.slice(0, -1)}${character}`;

            expect(() => parsePublicKeyEntry(mutated), character).toThrow(/base64url/);
        }
    });

    it('K6: refuses a JWK coordinate that is not the curve width', () =>
    {
        const short = encodeBase64Url(Buffer.alloc(31, 0xab));
        // node:crypto pads coordinates as RFC 7518 requires, so the only way to
        // reach this is a JWK from elsewhere — which is when it matters most.
        const fake = (jwk: Record<string, string>, type: string, namedCurve?: string) => ({
            asymmetricKeyType: type,
            asymmetricKeyDetails: { namedCurve },
            export: () => jwk,
        } as unknown as Parameters<typeof rawPublicKey>[0]);

        expect(() => rawPublicKey(fake({ x: short }, 'ed25519')))
            .toThrow(/coordinate x is 31 bytes, expected 32/);
        expect(() => rawPublicKey(fake({ x: short, y: short }, 'ec', 'prime256v1')))
            .toThrow(/coordinate x is 31 bytes, expected 32/);
    });

    it('K7: refuses a JWK coordinate that is not canonical base64url', () =>
    {
        const canonical = encodeBase64Url(Buffer.alloc(32, 0xab));
        // The last character of a 32-byte coordinate carries four bits no byte
        // uses, so several strings decode to these same bytes. Only one of them
        // is the key; `Buffer.from` would have accepted all of them.
        const alternatives = equivalentFinalCharacters(canonical);
        const fake = (x: string) => ({
            asymmetricKeyType: 'ed25519',
            export: () => ({ x }),
        } as unknown as Parameters<typeof rawPublicKey>[0]);

        expect(alternatives).toHaveLength(3);
        expect(rawPublicKey(fake(canonical))).toHaveLength(32);

        for (const character of alternatives)
        {
            expect(() => rawPublicKey(fake(`${canonical.slice(0, -1)}${character}`)), character)
                .toThrow(/coordinate x is not canonical base64url/);
        }
    });

    it('publishes a JWK Set that carries the kid and alg', () =>
    {
        const { publicKey } = generateLocalKeyPair('ES256');
        const jwks = toJwks([{ kid: 'es-1', alg: 'ES256', public: publicKey }]);

        expect(jwks.keys).toHaveLength(1);
        expect(jwks.keys[0]).toMatchObject({ kid: 'es-1', alg: 'ES256', use: 'sig', crv: 'P-256' });
    });

    it('reads a comma-separated list and refuses a duplicate kid or an empty one', () =>
    {
        const first = formatPublicKeyEntry({
            kid: 'a', alg: 'EdDSA', public: generateLocalKeyPair('EdDSA').publicKey,
        });
        const second = formatPublicKeyEntry({
            kid: 'b', alg: 'ES256', public: generateLocalKeyPair('ES256').publicKey,
        });

        expect([...parsePublicKeys(`${first}, ${second}`).keys()]).toEqual(['a', 'b']);
        expect(() => parsePublicKeys(`${first},${first}`)).toThrow(/Duplicate kid a/);
        expect(() => parsePublicKeys('   ')).toThrow(/No public keys/);
    });

    it('refuses key material that is not unpadded base64url', () =>
    {
        const { publicKey } = generateLocalKeyPair('EdDSA');
        const raw = encodeBase64Url(rawPublicKey(publicKey));

        expect(() => parsePublicKeyEntry(`k:${raw}=`)).toThrow(/base64url/);
        expect(() => parsePublicKeyEntry(`k:${raw.replace(/^./, '+')}`)).toThrow(/base64url/);
        expect(() => parsePublicKeyEntry(raw)).toThrow(/kid:base64url/);
    });
});
