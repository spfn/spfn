/**
 * The generator behind `contracts/signing/vectors.json`.
 *
 * ## What it is for
 *
 * The file it writes is the fixed point other implementations of SPFN's token
 * format check themselves against. For its first six vectors — Ed25519/ES256 ×
 * valid/expired/bad-signature, all canonically encoded — that fixed point held
 * only for the three verdicts they reach. A port could delete its rule for
 * non-canonical base64url, duplicate JSON members, `crit`, the media-type
 * members, `alg: none`, `invalid-claims`, `not-yet-valid`, `too-old` or
 * `no-expiry` and still pass all six. The review of superself-apps PR #64
 * proved it by removing them one at a time (issue #166).
 *
 * So there is now one vector per `VerifyFailureReason` and one per rule.
 *
 * ## Where the verdicts come from
 *
 * From the reference verifier, never from this file's opinion: every case
 * declares the reason it means to exercise, and `buildVectorFile()` throws
 * rather than writing anything if the verifier disagrees. A rule that changes
 * upstream therefore breaks the recording instead of being quietly re-recorded.
 *
 * The reference is imported from `packages/signing/src`, never from `dist`: a
 * published build lags its sources, and a stale oracle records stale verdicts.
 *
 * ## Determinism
 *
 * Re-running must reproduce the committed file byte for byte, because a
 * regenerate-and-compare that drifts is a test nobody can read. Everything
 * here is therefore fixed: the key material is two constants, `verifyAt` is a
 * constant, and every object is built in one member order.
 *
 * The one thing that cannot be: ECDSA chooses a fresh nonce per signature, so
 * an ES256 signature is different every time it is produced. Those three
 * signatures are carried over from the committed file when the bytes they sign
 * are unchanged — see `carriedEs256Token()`. They are still put through the
 * verifier like every other vector, so a carried signature that stopped
 * meaning what it claims fails the run.
 *
 * ## Running it
 *
 * The reference sources import each other extensionlessly, which node cannot
 * resolve on its own, so the runner is vitest:
 *
 *     UPDATE_SIGNING_VECTORS=1 pnpm --filter @spfn/signing test vectors
 *
 * `packages/signing/src/vectors.test.ts` calls in here, compares what comes
 * back with the committed file, and writes only under that variable.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeBase64Url } from '../../packages/signing/src/jws';
import { formatPublicKeyEntry } from '../../packages/signing/src/keys';
import { LocalSigner } from '../../packages/signing/src/providers/local';
import { verifyJws } from '../../packages/signing/src/verify';
import type {
    SigningAlgorithm,
    VerifyFailureReason,
    VerifyOptions,
} from '../../packages/signing/src/types';

/** The file this module owns. */
export const VECTORS_FILE = join(dirname(fileURLToPath(import.meta.url)), 'vectors.json');

/**
 * The instant every vector is judged at.
 *
 * A constant, so `expired` stays expired and `valid` stays valid however long
 * the file lives — and so that nothing here reads the clock.
 */
export const VERIFY_AT = 1_800_000_000_000;

const NOW_SEC = VERIFY_AT / 1000;

const ISSUER = 'spfn-signing-vectors';

/** The options a vector may carry; the rest of `VerifyOptions` is the caller's. */
export type VectorOptions = Pick<VerifyOptions, 'clockSkewSec' | 'maxAgeSec'>;

export type Verdict = { ok: true } | { ok: false; reason: VerifyFailureReason };

export interface Vector
{
    name: string;
    /** The rule this vector exists to hold in place. Absent on the frozen six. */
    why?: string;
    /**
     * The key that produced the signature — not what the header claims. Several
     * vectors exist precisely because those two disagree.
     */
    kid: string;
    alg: SigningAlgorithm;
    token: string;
    options?: VectorOptions;
    expect: Verdict;
}

export interface VectorFile
{
    note: string;
    verifyAt: number;
    publicKeys: string;
    vectors: Vector[];
}

/**
 * Fixed key material, so regenerating produces the same keys.
 *
 * The default algorithm comes first, so an implementation working through the
 * file in order meets Ed25519 before ES256. Test-only throwaway values with no
 * counterpart anywhere; the ES256 scalar starts at 0x01, which keeps it
 * comfortably below the curve order.
 */
const FIXTURE_KEYS = [
    {
        kid: 'vector-ed25519',
        alg: 'EdDSA' as SigningAlgorithm,
        material: '202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f',
    },
    {
        kid: 'vector-es256',
        alg: 'ES256' as SigningAlgorithm,
        material: '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
    },
];

/** A signer over fixed material, loaded the way a deployment would load it. */
function fixtureSigner(kid: string, alg: SigningAlgorithm, material: string): LocalSigner
{
    process.env.SPFN_SIGNING_VECTOR_KEY = encodeBase64Url(Buffer.from(material, 'hex'));

    try
    {
        return new LocalSigner({ kid, alg, privateKey: { env: 'SPFN_SIGNING_VECTOR_KEY' } });
    }
    finally
    {
        delete process.env.SPFN_SIGNING_VECTOR_KEY;
    }
}

const ED = fixtureSigner(FIXTURE_KEYS[0].kid, FIXTURE_KEYS[0].alg, FIXTURE_KEYS[0].material);

const P256 = fixtureSigner(FIXTURE_KEYS[1].kid, FIXTURE_KEYS[1].alg, FIXTURE_KEYS[1].material);

/** Flip one bit of the signature: the same token, signed by nobody. */
function flipSignatureByte(token: string): string
{
    const [head, body, signature] = token.split('.');
    const bytes = Buffer.from(signature, 'base64url');

    bytes[0] ^= 0x01;

    return `${head}.${body}.${encodeBase64Url(bytes)}`;
}

/** The RFC 4648 §5 alphabet, in value order. */
export const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Spare bits in a segment's final character, by the segment's length mod 4.
 *
 * Four base64url characters carry three bytes exactly, so a segment whose
 * length is a multiple of four has no spare bits at all. A short last group
 * does: two characters carry one byte and leave four bits over, three carry
 * two bytes and leave two. Those spare bits are always the LOW bits of the
 * final character, which is why flipping bit 0 is enough for either width.
 */
const SPARE_BITS_BY_REMAINDER: Record<number, number> = { 2: 4, 3: 2 };

/**
 * Respell the last character of the signature segment.
 *
 * A 64-byte signature ends in a two-character group carrying one byte, so the
 * final character's low four bits encode nothing. Flipping the lowest of them
 * leaves the decoded bytes identical and the text different — which is the
 * whole problem: sixteen strings would otherwise be the same token.
 *
 * Flipping rather than advancing, because advancing runs off the end of the
 * alphabet at `_` (value 63) and hands back `undefined`. A flip of a spare bit
 * is its own inverse and lands inside the alphabet from every one of the 64
 * characters, so this is total for any signature that has a respelling at all.
 */
export function respellSignature(token: string): string
{
    const [head, body, signature] = token.split('.');

    if (!SPARE_BITS_BY_REMAINDER[signature.length % 4])
    {
        throw new Error(
            `respellSignature: a ${signature.length}-character segment spends every bit it has, `
            + 'so it has exactly one spelling and nothing to respell',
        );
    }

    const last = BASE64URL_ALPHABET.indexOf(signature.slice(-1));

    return `${head}.${body}.${signature.slice(0, -1)}${BASE64URL_ALPHABET[last ^ 1]}`;
}

interface Case
{
    name: string;
    why?: string;
    signer: LocalSigner;
    /** The protected header as TEXT: half of these are shapes `JSON.stringify` cannot make. */
    header: string;
    /** The payload as TEXT, for the same reason. */
    payload: string;
    /** Rewrite the finished token — the only way to express a signature that is not one. */
    mangle?: (token: string) => string;
    options?: VectorOptions;
    expect: Verdict;
}

function header(signer: LocalSigner, over: Record<string, unknown> = {}): string
{
    return JSON.stringify({ alg: signer.alg, kid: signer.kid, ...over });
}

/** The anchor payload every new vector differs from by exactly one thing. */
function claims(over: Record<string, unknown> = {}): string
{
    return JSON.stringify({
        iss: ISSUER,
        sub: 'vector',
        iat: NOW_SEC - 1000,
        exp: NOW_SEC + 300,
        ...over,
    });
}

/**
 * The six vectors this file started life with, reproduced exactly.
 *
 * Their bytes are frozen: a copy of them lives in superself-apps as
 * `infra/workspace/bridge/fixtures/signing-vectors.json` and is refreshed by
 * copying this file again and reading the diff. A token that changed here
 * would be a diff nobody could review and a port nobody could trust. They
 * carry no `why` for the same reason — an added member is a changed byte.
 * Their rules are in `README.md` with everyone else's.
 */
function frozenCases(): Case[]
{
    const valid = JSON.stringify({ iss: ISSUER, sub: 'vector', iat: 1_799_999_000, exp: 4_102_444_800 });
    const expired = JSON.stringify({ iss: ISSUER, sub: 'vector', iat: 1_700_000_000, exp: 1_700_000_300 });

    return [ED, P256].flatMap((signer) =>
    {
        const label = signer.alg === 'ES256' ? 'es256' : 'ed25519';

        return [
            {
                name: `${label}-valid`,
                signer,
                header: header(signer),
                payload: valid,
                expect: { ok: true } as Verdict,
            },
            {
                name: `${label}-expired`,
                signer,
                header: header(signer),
                payload: expired,
                expect: { ok: false, reason: 'expired' } as Verdict,
            },
            {
                name: `${label}-bad-signature`,
                signer,
                header: header(signer),
                payload: valid,
                mangle: flipSignatureByte,
                expect: { ok: false, reason: 'bad-signature' } as Verdict,
            },
        ];
    });
}

/**
 * One vector per rule the six do not reach.
 *
 * All Ed25519: the rules are the verifier's and not the curve's, and Ed25519
 * signs the same bytes the same way every time, which is what lets the file be
 * compared rather than merely replayed.
 */
function ruleCases(): Case[]
{
    return [
        {
            name: 'non-canonical-base64url',
            why: 'the last character of the signature segment carries bits no byte uses, so sixteen '
                + 'strings decode to the same 64 bytes; a token that can be rewritten without '
                + 'invalidating it cannot key a one-time-use set',
            signer: ED,
            header: header(ED),
            payload: claims(),
            mangle: respellSignature,
            expect: { ok: false, reason: 'malformed' },
        },
        {
            name: 'duplicate-header-member',
            why: 'RFC 8259 §4 leaves duplicate members undefined and JSON.parse keeps the last, so '
                + 'this header is EdDSA to one reader and "none" to another',
            signer: ED,
            header: `{"alg":"${ED.alg}","kid":"${ED.kid}","alg":"none"}`,
            payload: claims(),
            expect: { ok: false, reason: 'malformed' },
        },
        {
            name: 'duplicate-payload-member',
            why: 'the same scan on the payload, which a port that only checked the header would '
                + 'let through: two `sub` claims is two answers to "who"',
            signer: ED,
            header: header(ED),
            payload: `{"iss":"${ISSUER}","sub":"vector","sub":"somebody-else",`
                + `"iat":${NOW_SEC - 1000},"exp":${NOW_SEC + 300}}`,
            expect: { ok: false, reason: 'malformed' },
        },
        {
            name: 'crit-present',
            why: '`crit` names extensions a verifier must understand; this one implements none, so '
                + 'RFC 7515 §4.1.11 says refuse rather than guess',
            signer: ED,
            header: header(ED, { crit: ['exp'] }),
            payload: claims(),
            expect: { ok: false, reason: 'malformed' },
        },
        {
            name: 'typ-not-string',
            why: 'RFC 7515 §4.1.9 makes `typ` a media type; `typ: 5` hands every caller that '
                + 'compares it a value its own type says cannot be there',
            signer: ED,
            header: header(ED, { typ: 5 }),
            payload: claims(),
            expect: { ok: false, reason: 'malformed' },
        },
        {
            name: 'cty-not-string',
            why: 'the same rule for `cty` (RFC 7515 §4.1.10)',
            signer: ED,
            header: header(ED, { cty: {} }),
            payload: claims(),
            expect: { ok: false, reason: 'malformed' },
        },
        {
            name: 'alg-none',
            why: '`alg` is only ever compared to the KEY\'s algorithm, so "none" is a mismatch and '
                + 'never an invitation to skip the signature check',
            signer: ED,
            header: header(ED, { alg: 'none' }),
            payload: claims(),
            expect: { ok: false, reason: 'alg-mismatch' },
        },
        {
            name: 'alg-not-the-keys',
            why: 'the same comparison with a real algorithm: an ES256 header over the Ed25519 key '
                + 'is refused before any signature is checked',
            signer: ED,
            header: header(ED, { alg: 'ES256' }),
            payload: claims(),
            expect: { ok: false, reason: 'alg-mismatch' },
        },
        {
            name: 'unknown-kid',
            why: 'the header names a key this verifier does not hold, which is a verdict of its '
                + 'own and not a bad signature',
            signer: ED,
            header: header(ED, { kid: 'vector-absent' }),
            payload: claims(),
            expect: { ok: false, reason: 'unknown-kid' },
        },
        {
            name: 'iat-after-exp',
            why: 'a token that expired before it was issued: no clock makes both claims true, so '
                + 'it is the issuer\'s bug and not an expiry',
            signer: ED,
            header: header(ED),
            payload: claims({ iat: NOW_SEC, exp: NOW_SEC - 300 }),
            expect: { ok: false, reason: 'invalid-claims' },
        },
        {
            name: 'non-finite-claim',
            why: '`1e999` parses to Infinity; treating a present-but-unusable `exp` as "no expiry '
                + 'given" turns a typo into an immortal token',
            signer: ED,
            header: header(ED),
            payload: `{"iss":"${ISSUER}","sub":"vector","iat":${NOW_SEC - 1000},"exp":1e999}`,
            expect: { ok: false, reason: 'invalid-claims' },
        },
        {
            name: 'not-yet-valid',
            why: '`nbf` an hour ahead, well beyond the default 30 seconds of skew',
            signer: ED,
            header: header(ED),
            payload: claims({ nbf: NOW_SEC + 3600 }),
            expect: { ok: false, reason: 'not-yet-valid' },
        },
        {
            name: 'too-old',
            why: 'a token that granted itself a longer life than the caller allows. Only reachable '
                + 'under `maxAgeSec`, which is why the vector carries its own options',
            signer: ED,
            header: header(ED),
            payload: claims({ exp: NOW_SEC + 86_400 }),
            options: { maxAgeSec: 300 },
            expect: { ok: false, reason: 'too-old' },
        },
        {
            name: 'no-expiry',
            why: 'under `maxAgeSec` a missing `exp` leaves the lifetime uncomputable, so it is a '
                + 'refusal and not an exemption',
            signer: ED,
            header: header(ED),
            payload: `{"iss":"${ISSUER}","sub":"vector","iat":${NOW_SEC - 1000}}`,
            options: { maxAgeSec: 300 },
            expect: { ok: false, reason: 'no-expiry' },
        },
    ];
}

async function signCase(item: Case): Promise<string>
{
    const head = `${encodeBase64Url(item.header)}.${encodeBase64Url(item.payload)}`;
    const signature = await item.signer.signRaw(Buffer.from(head, 'ascii'));
    const token = `${head}.${encodeBase64Url(signature)}`;

    return item.mangle ? item.mangle(token) : token;
}

/** The committed tokens, by vector name, or nothing if the file is not there yet. */
function committedTokens(): Map<string, string>
{
    try
    {
        const file = JSON.parse(readFileSync(VECTORS_FILE, 'utf8')) as VectorFile;

        return new Map(file.vectors.map((vector) => [vector.name, vector.token]));
    }
    catch
    {
        return new Map();
    }
}

/**
 * Keep the committed ES256 signature when it signs the bytes we just built.
 *
 * ECDSA's nonce is random, so re-signing produces a different token every run
 * and the file would never compare equal to itself. What is compared instead
 * is everything the generator does control — the header and payload segments —
 * and the carried signature is checked by the verifier alongside every other
 * vector. A signature that no longer means what its vector claims fails the
 * run; it does not get carried past it.
 */
function carriedEs256Token(item: Case, fresh: string, committed: Map<string, string>): string
{
    const kept = committed.get(item.name);
    const signedBytes = fresh.split('.').slice(0, 2).join('.');

    if (item.signer.alg !== 'ES256' || !kept?.startsWith(`${signedBytes}.`))
    {
        return fresh;
    }

    return kept;
}

function toVector(item: Case, token: string): Vector
{
    return {
        name: item.name,
        why: item.why,
        kid: item.signer.kid,
        alg: item.signer.alg,
        token,
        options: item.options,
        expect: item.expect,
    };
}

function reasonOf(verdict: Verdict): string
{
    return verdict.ok ? 'ok' : verdict.reason;
}

/** Every vector whose recorded reason is not the one the verifier gives it. */
function disagreements(vectors: Vector[], publicKeys: string): string[]
{
    return vectors.flatMap((vector) =>
    {
        const verdict = verifyJws(vector.token, publicKeys, { now: VERIFY_AT, ...vector.options });

        return reasonOf(verdict) === reasonOf(vector.expect)
            ? []
            : [`${vector.name}: means to record ${reasonOf(vector.expect)}, `
                + `the reference verifier says ${reasonOf(verdict)}`];
    });
}

const NOTE = 'Generated by contracts/signing/record-vectors.ts from packages/signing/src '
    + '(never dist). Regenerate with UPDATE_SIGNING_VECTORS=1 '
    + 'pnpm --filter @spfn/signing test vectors.';

/**
 * Build the whole file in memory.
 *
 * Throws rather than returning a file whose verdicts are this module's belief:
 * the point of the exercise is that they are the verifier's.
 */
export async function buildVectorFile(): Promise<VectorFile>
{
    const committed = committedTokens();
    const cases = [...frozenCases(), ...ruleCases()];
    const vectors: Vector[] = [];

    for (const item of cases)
    {
        vectors.push(toVector(item, carriedEs256Token(item, await signCase(item), committed)));
    }

    const publicKeys = [await ED.publicKey(), await P256.publicKey()]
        .map(formatPublicKeyEntry)
        .join(',');
    const disagreed = disagreements(vectors, publicKeys);

    if (disagreed.length > 0)
    {
        throw new Error(
            `contracts/signing/vectors.json was not written — every vector must exercise the rule `
            + `it names:\n${disagreed.join('\n')}`,
        );
    }

    return { note: NOTE, verifyAt: VERIFY_AT, publicKeys, vectors };
}

/** The file's exact text. Four-space JSON with a trailing newline, as committed. */
export function serializeVectorFile(file: VectorFile): string
{
    return `${JSON.stringify(file, null, 4)}\n`;
}

/** Build and write. The only thing in here that touches the working tree. */
export async function writeVectorFile(): Promise<VectorFile>
{
    const file = await buildVectorFile();

    writeFileSync(VECTORS_FILE, serializeVectorFile(file));

    return file;
}
