/**
 * Helpers the tests share.
 *
 * Not part of any entry point and not built into `dist` — `tsup` only follows
 * `src/index.ts` and `src/verify.ts`.
 */

import { generateLocalKeyPair, LocalSigner } from './providers/local';
import type { PublicKeyEntry, SigningAlgorithm } from './types';

/** A signer over a freshly generated key. */
export function testSigner(kid: string, alg: SigningAlgorithm): LocalSigner
{
    return new LocalSigner({ kid, alg, privateKey: generateLocalKeyPair(alg).privateKey });
}

/** A signer and its public entry, which is what most tests need. */
export async function testKey(
    kid: string,
    alg: SigningAlgorithm,
): Promise<{ signer: LocalSigner; entry: PublicKeyEntry }>
{
    const signer = testSigner(kid, alg);

    return { signer, entry: await signer.publicKey() };
}

/** The base64url alphabet, in the order RFC 4648 §5 numbers it. */
const BASE64URL_ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * The other characters that could end `segment` without changing the bytes it
 * decodes to.
 *
 * The final character of an unpadded base64url string carries bits no whole
 * byte uses — four of them when the length is 2 mod 4, two when it is 3 — and
 * `Buffer` ignores them. Those are exactly the strings a canonical decoder has
 * to refuse, so the tests need to be able to build them.
 */
export function equivalentFinalCharacters(segment: string): string[]
{
    const unusedBits = segment.length % 4 === 2 ? 4 : 2;
    const last = segment[segment.length - 1];
    const group = BASE64URL_ALPHABET.indexOf(last) & ~((1 << unusedBits) - 1);

    return [...BASE64URL_ALPHABET.slice(group, group + (1 << unusedBits))]
        .filter((character) => character !== last);
}
