import { sign, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeBase64Url, derSignatureToJose, encodeBase64Url, signCompact, timeClaims } from './jws';
import { generateLocalKeyPair } from './providers/local';
import { equivalentFinalCharacters, testKey } from './test-support';
import type { PublicKeyEntry } from './types';
import { verifyJws } from './verify';

/** Build a token with a header we choose, signed for real by `signer`. */
async function forgeHeader(
    signer: { signRaw(input: Buffer): Promise<Buffer> },
    header: Record<string, unknown>,
    payload: Record<string, unknown>,
): Promise<string>
{
    const head = encodeBase64Url(JSON.stringify(header));
    const body = encodeBase64Url(JSON.stringify(payload));
    const signature = await signer.signRaw(Buffer.from(`${head}.${body}`, 'ascii'));

    return `${head}.${body}.${encodeBase64Url(signature)}`;
}

/**
 * Build a token whose payload is exactly this JSON text, signed for real.
 *
 * `JSON.stringify` cannot write `1e999`, and writes `null` for `Infinity`, so
 * a claim that is present-but-not-a-number has to be spelled out by hand.
 */
async function forgePayload(
    signer: { kid: string; alg: string; signRaw(input: Buffer): Promise<Buffer> },
    payloadJson: string,
): Promise<string>
{
    const head = encodeBase64Url(JSON.stringify({ alg: signer.alg, kid: signer.kid }));
    const body = encodeBase64Url(payloadJson);
    const signature = await signer.signRaw(Buffer.from(`${head}.${body}`, 'ascii'));

    return `${head}.${body}.${encodeBase64Url(signature)}`;
}

/** Build a token whose *header* is exactly this JSON text, signed for real. */
async function forgeHeaderJson(
    signer: { signRaw(input: Buffer): Promise<Buffer> },
    headerJson: string,
    payload: Record<string, unknown>,
): Promise<string>
{
    const head = encodeBase64Url(headerJson);
    const body = encodeBase64Url(JSON.stringify(payload));
    const signature = await signer.signRaw(Buffer.from(`${head}.${body}`, 'ascii'));

    return `${head}.${body}.${encodeBase64Url(signature)}`;
}

function flipSignatureByte(token: string): string
{
    const [head, body, signature] = token.split('.');
    const bytes = Buffer.from(signature, 'base64url');

    bytes[0] ^= 0x01;

    return `${head}.${body}.${encodeBase64Url(bytes)}`;
}

/**
 * The two payload sizes J12 compares, and the ceiling on the ratio between the
 * times they verify in.
 *
 * The duplicate-member scan walks the payload text, so verification is linear
 * in the payload's size: a careless scan — one that decoded every string it
 * passed rather than only the member names, or that restarted at every member —
 * is superlinear, and shows that shape as the payload grows. That shape is the
 * claim; the milliseconds it takes to walk a megabyte are a property of the
 * machine, which is why the assertion is on the ratio and not on a budget.
 *
 * A 16x payload costs a linear scan ~16x the time, and less than that here
 * because the fixed cost of a verification is charged to both sides. The
 * ceiling is four times the 16x a linear scan would spend, which a quadratic
 * scan — ~256x for the same step — cannot fit under. Measured locally the
 * ratio is ~11, under an eight-way CPU load ~12.
 */
const SMALL_PAYLOAD_BYTES = 64 * 1024;
const LARGE_PAYLOAD_BYTES = 1024 * 1024;
const LINEAR_SCAN_RATIO_CEILING = 64;

/**
 * The cheapest of several verifications of `token`, in milliseconds.
 *
 * Scheduling and garbage collection can only add time to a run, never remove
 * it, so the cheapest run is the one least contaminated by a busy machine.
 */
function fastestVerifyMs(token: string, entry: PublicKeyEntry): number
{
    let fastest = Infinity;

    for (let run = 0; run < 5; run += 1)
    {
        const started = performance.now();

        verifyJws(token, [entry]);
        fastest = Math.min(fastest, performance.now() - started);
    }

    return fastest;
}

describe('jws', () =>
{
    it('J1: round-trips an ES256 token', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        const payload = { sub: 'tenant-7', scope: ['read', 'write'], n: 42 };

        const result = verifyJws(await signer.sign(payload), [entry]);

        expect(result).toEqual({
            ok: true,
            header: { alg: 'ES256', kid: 'es256-1' },
            payload,
        });
    });

    it('J2: round-trips an EdDSA token', async () =>
    {
        const { signer, entry } = await testKey('ed-1', 'EdDSA');

        const result = verifyJws(await signer.sign({ sub: 'tenant-7' }, { typ: 'bridge+jwt' }), [entry]);

        expect(result.ok).toBe(true);
        expect(result.ok && result.header).toEqual({ alg: 'EdDSA', kid: 'ed-1', typ: 'bridge+jwt' });
    });

    it('J3: rejects a token whose signature has one byte flipped', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        const token = flipSignatureByte(await signer.sign({ sub: 'a' }));

        expect(verifyJws(token, [entry])).toEqual({ ok: false, reason: 'bad-signature' });
    });

    it('J4: rejects alg "none", however well signed', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        const token = await forgeHeader(signer, { alg: 'none', kid: 'es256-1' }, { sub: 'a' });

        expect(verifyJws(token, [entry])).toEqual({ ok: false, reason: 'alg-mismatch' });
    });

    it('J5: rejects an ES256 header over a kid that names an EdDSA key', async () =>
    {
        const { signer, entry } = await testKey('ed-1', 'EdDSA');
        const token = await forgeHeader(signer, { alg: 'ES256', kid: 'ed-1' }, { sub: 'a' });

        expect(verifyJws(token, [entry])).toEqual({ ok: false, reason: 'alg-mismatch' });
    });

    it('J6: a missing kid is malformed, an unrecognised one is unknown-kid', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        const headerless = await forgeHeader(signer, { alg: 'ES256' }, { sub: 'a' });
        const stranger = await forgeHeader(signer, { alg: 'ES256', kid: 'es256-2' }, { sub: 'a' });

        expect(verifyJws(headerless, [entry])).toEqual({ ok: false, reason: 'malformed' });
        expect(verifyJws(stranger, [entry])).toEqual({ ok: false, reason: 'unknown-kid' });
    });

    it('J6: rejects a crit header, because it understands no extensions', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        const token = await forgeHeader(
            signer,
            { alg: 'ES256', kid: 'es256-1', crit: ['exp'] },
            { sub: 'a' },
        );

        expect(verifyJws(token, [entry])).toEqual({ ok: false, reason: 'malformed' });
    });

    it('J7: rejects anything that is not three strict base64url segments', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        const token = await signer.sign({ sub: 'a' });
        const [head, body, signature] = token.split('.');
        const malformed = {
            'two segments': `${head}.${body}`,
            'four segments': `${token}.${signature}`,
            'empty signature': `${head}.${body}.`,
            'padded': `${head}.${body}.${signature}=`,
            'base64 plus': `${head}.${body}.${signature.replace(/^./, '+')}`,
            'base64 slash': `${head}.${body}.${signature.replace(/^./, '/')}`,
            'not base64url at all': `${head}.${body}.not a signature`,
            // 5 base64url characters encode 3 whole bytes and one stray sextet.
            'one leftover character': `${head}.${body}.AAAAA`,
            'not a string': 12345,
        };

        for (const [name, candidate] of Object.entries(malformed))
        {
            expect(verifyJws(candidate, [entry]), name).toEqual({ ok: false, reason: 'malformed' });
        }
    });

    it('J8: verifies the bytes received, not a re-serialization of them', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        // Property order that JSON.stringify preserves and a canonicaliser would not.
        const payload = { z: 1, a: 2 };
        const token = await signer.sign(payload);
        const [head, , signature] = token.split('.');
        const reordered = `${head}.${encodeBase64Url(JSON.stringify({ a: 2, z: 1 }))}.${signature}`;

        expect(verifyJws(token, [entry]).ok).toBe(true);
        expect(verifyJws(reordered, [entry])).toEqual({ ok: false, reason: 'bad-signature' });
    });

    it('J9: honours exp, with 30 seconds of skew', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        const now = 1_800_000_000_000;
        const token = await signer.sign({ exp: Math.floor(now / 1000) - 20 });

        expect(verifyJws(token, [entry], { now }).ok).toBe(true);
        expect(verifyJws(token, [entry], { now: now + 20_000 })).toEqual({
            ok: false,
            reason: 'expired',
        });
    });

    it('J10: honours nbf', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        const now = 1_800_000_000_000;
        const token = await signer.sign({ nbf: Math.floor(now / 1000) + 600 });

        expect(verifyJws(token, [entry], { now })).toEqual({ ok: false, reason: 'not-yet-valid' });
    });

    it('J11: rejects a token that grants itself a longer life than maxAgeSec', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        const now = 1_800_000_000_000;
        const claims = timeClaims({ ttlSec: 301, now });

        expect(verifyJws(await signer.sign(claims), [entry], { now, maxAgeSec: 300 })).toEqual({
            ok: false,
            reason: 'too-old',
        });
        expect(verifyJws(
            await signer.sign(timeClaims({ ttlSec: 300, now })),
            [entry],
            { now, maxAgeSec: 300 },
        ).ok).toBe(true);
    });

    it('J11a: maxAgeSec refuses a token that has exp but no iat', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        const now = 1_800_000_000_000;
        // Ten years, and the only lifetime control the caller has is maxAgeSec.
        const token = await signer.sign({ exp: Math.floor(now / 1000) + 315_360_000 });

        expect(verifyJws(token, [entry], { now, maxAgeSec: 300 }))
            .toEqual({ ok: false, reason: 'no-expiry' });
    });

    it('J11b: maxAgeSec refuses a token that has iat but no exp', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        const now = 1_800_000_000_000;
        const token = await signer.sign({ iat: Math.floor(now / 1000), sub: 'a' });

        expect(verifyJws(token, [entry], { now, maxAgeSec: 300 }))
            .toEqual({ ok: false, reason: 'no-expiry' });
    });

    it('J11c: maxAgeSec refuses a token with neither claim', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');

        expect(verifyJws(await signer.sign({ sub: 'a' }), [entry], { maxAgeSec: 300 }))
            .toEqual({ ok: false, reason: 'no-expiry' });
    });

    it('J11d: a token with no time claims is fine when maxAgeSec is unset', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');

        expect(verifyJws(await signer.sign({ sub: 'a' }), [entry]).ok).toBe(true);
        expect(verifyJws(await signer.sign({ exp: 4_000_000_000 }), [entry]).ok).toBe(true);
    });

    it('J13: refuses a segment whose base64url is not canonical', async () =>
    {
        const { signer, entry } = await testKey('ed-1', 'EdDSA');
        const token = await signer.sign({ sub: 'a' });
        const [head, body, signature] = token.split('.');
        // 64 bytes take 86 characters, four bits of which encode nothing: 15
        // other strings decode to the same signature and must not be tokens.
        const alternatives = equivalentFinalCharacters(signature);

        expect(alternatives).toHaveLength(15);
        expect(verifyJws(token, [entry]).ok).toBe(true);

        for (const character of alternatives)
        {
            const mutated = `${head}.${body}.${signature.slice(0, -1)}${character}`;

            expect(mutated, character).not.toBe(token);
            expect(verifyJws(mutated, [entry]), character)
                .toEqual({ ok: false, reason: 'malformed' });
        }
    });

    it('J13: decodeBase64Url refuses the same non-canonical strings directly', () =>
    {
        for (const canonical of ['AA', 'AAA', encodeBase64Url(Buffer.alloc(32, 0xff))])
        {
            expect(decodeBase64Url(canonical), canonical).not.toBeNull();

            for (const character of equivalentFinalCharacters(canonical))
            {
                const mutated = `${canonical.slice(0, -1)}${character}`;

                expect(decodeBase64Url(mutated), mutated).toBeNull();
            }
        }
    });

    it('J14: refuses a time claim that is present but is not a finite number', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        const now = 1_800_000_000_000;
        // 1e999 is the subtle one: it parses to Infinity, which used to fall
        // through Number.isFinite and be read as "this token has no expiry".
        const values = ['"1800000000"', '"0"', 'null', 'true', '{}', '[]', '1e999'];

        for (const claim of ['exp', 'nbf', 'iat'])
        {
            for (const value of values)
            {
                const token = await forgePayload(signer, `{"sub":"a","${claim}":${value}}`);

                // `invalid-claims`, not `malformed`: this token is ours and it
                // verified — a broken issuer is not scanner noise.
                expect(verifyJws(token, [entry], { now }), `${claim}=${value}`)
                    .toEqual({ ok: false, reason: 'invalid-claims' });
            }
        }
    });

    it('J16: maxAgeSec refuses a token dated into the future', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        const now = 1_800_000_000_000;
        // A sixty-second token, issued thirty years from now. Its self-declared
        // lifetime honours maxAgeSec; its acceptance window is thirty years, and
        // bounding `exp - iat` alone would let it through both today and then.
        const iat = Math.floor(now / 1000) + 946_080_000;
        const token = await signer.sign({ iat, exp: iat + 60 });

        for (const at of [now, (iat - 3600) * 1000])
        {
            expect(verifyJws(token, [entry], { now: at, maxAgeSec: 300 }), String(at))
                .toEqual({ ok: false, reason: 'not-yet-valid' });
        }

        // The window now tracks the clock rather than the payload: the same
        // token is accepted once that clock reaches it, and for sixty seconds.
        expect(verifyJws(token, [entry], { now: iat * 1000, maxAgeSec: 300 }).ok).toBe(true);
        expect(verifyJws(token, [entry], { now: (iat + 120) * 1000, maxAgeSec: 300 }))
            .toEqual({ ok: false, reason: 'expired' });

        // An iat inside the skew is simply a token issued now.
        const fresh = Math.floor(now / 1000) + 20;

        expect(verifyJws(
            await signer.sign({ iat: fresh, exp: fresh + 60 }),
            [entry],
            { now, maxAgeSec: 300 },
        ).ok).toBe(true);
    });

    it('J17: refuses a token whose iat is after its exp', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        const now = 1_800_000_000_000;
        const nowSec = Math.floor(now / 1000);
        const token = await signer.sign({ iat: nowSec + 60, exp: nowSec + 30 });

        // No clock makes these two true at once, so no option set can rescue it.
        expect(verifyJws(token, [entry], { now })).toEqual({ ok: false, reason: 'invalid-claims' });
        expect(verifyJws(token, [entry], { now, maxAgeSec: 300 }))
            .toEqual({ ok: false, reason: 'invalid-claims' });
    });

    it('J18: reports a dead token as expired even when maxAgeSec is set', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');

        // It has no `iat`, so the maxAgeSec policy also has something to say —
        // but `no-expiry` on a token that expired in 1970 is a wrong answer.
        expect(verifyJws(await signer.sign({ exp: 1 }), [entry], { maxAgeSec: 300 }))
            .toEqual({ ok: false, reason: 'expired' });
    });

    it('J15: refuses at sign time a header its own verifier would reject', async () =>
    {
        const { signer } = await testKey('es256-1', 'ES256');

        await expect(signer.sign({ sub: 'a' }, { header: { crit: ['x'], x: 1 } }))
            .rejects.toThrow(/may not carry crit/);
        // `crit: undefined` is still `crit` in the header a spread produces.
        await expect(signer.sign({ sub: 'a' }, { header: { crit: undefined } }))
            .rejects.toThrow(/may not carry crit/);
    });

    it('J20: refuses a duplicate JSON member, in the header or the payload', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        const header = `{"alg":"ES256","kid":"es256-1"`;

        const payloads = [
            '{"sub":"a","sub":"b"}',
            // Nested, and inside an array element — the scan is not top-level only.
            '{"sub":"a","claims":{"role":"reader","role":"admin"}}',
            '{"sub":"a","claims":[{"role":"reader","role":"admin"}]}',
        ];

        for (const payload of payloads)
        {
            expect(verifyJws(await forgePayload(signer, payload), [entry]), payload)
                .toEqual({ ok: false, reason: 'malformed' });
        }

        const headers = [
            `${header},"kid":"es256-2"}`,
            `${header},"typ":"a","typ":"b"}`,
            `${header},"nested":{"x":1,"x":2}}`,
        ];

        for (const headerJson of headers)
        {
            expect(verifyJws(await forgeHeaderJson(signer, headerJson, { sub: 'a' }), [entry]), headerJson)
                .toEqual({ ok: false, reason: 'malformed' });
        }
    });

    it('J20: a repeated member spelled inside a string value is data, not a member', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        // The value contains the text of a duplicate object, and an escaped
        // quote, so a scanner that does not track strings would reject it.
        const payload = { note: '{"a":1,"a":2}', quoted: 'say "a": 1, "a": 2', a: 1 };

        const result = verifyJws(await signer.sign(payload), [entry]);

        expect(result).toEqual({ ok: true, header: { alg: 'ES256', kid: 'es256-1' }, payload });
    });

    it('J20: a name and its unicode escape are the same member', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');

        // `a` is `a`. Two JSON parsers agree on that and would disagree on
        // which value survives, which is the whole reason duplicates are refused.
        expect(verifyJws(await forgePayload(signer, '{"a":1,"\\u0061":2}'), [entry]))
            .toEqual({ ok: false, reason: 'malformed' });

        // Escapes are not duplicates by themselves.
        expect(verifyJws(await forgePayload(signer, '{"\\u0061":1,"b":2}'), [entry]).ok).toBe(true);
    });

    it('J21: refuses a typ or cty that is present but is not a string', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        const header = '{"alg":"ES256","kid":"es256-1"';

        for (const member of ['typ', 'cty'])
        {
            for (const value of ['1', 'null', 'true', '{}', '[]', '["a"]'])
            {
                const token = await forgeHeaderJson(signer, `${header},"${member}":${value}}`, { sub: 'a' });

                expect(verifyJws(token, [entry]), `${member}=${value}`)
                    .toEqual({ ok: false, reason: 'malformed' });
            }

            const good = await forgeHeaderJson(signer, `${header},"${member}":"x+jwt"}`, { sub: 'a' });

            expect(verifyJws(good, [entry]).ok, member).toBe(true);
        }
    });

    it('J12: verifies a 1 MiB payload with a scan that stays linear in its size', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        const small = await signer.sign({ blob: 'x'.repeat(SMALL_PAYLOAD_BYTES) });
        const large = await signer.sign({ blob: 'x'.repeat(LARGE_PAYLOAD_BYTES) });

        const result = verifyJws(large, [entry]);

        expect(result.ok && (result.payload.blob as string).length).toBe(LARGE_PAYLOAD_BYTES);
        expect(fastestVerifyMs(large, entry) / fastestVerifyMs(small, entry))
            .toBeLessThan(LINEAR_SCAN_RATIO_CEILING);
    });

    it('signCompact refuses to let a caller choose alg or kid', async () =>
    {
        const { signer, entry } = await testKey('es256-1', 'ES256');
        const token = await signCompact(signer, { sub: 'a' }, {
            header: { alg: 'none', kid: 'somebody-else', extra: 1 },
        });

        const result = verifyJws(token, [entry]);

        expect(result.ok && result.header).toEqual({ alg: 'ES256', kid: 'es256-1', extra: 1 });
    });
});

describe('derSignatureToJose', () =>
{
    it('left-pads a short r and strips a DER sign byte from s', () =>
    {
        // 0x0b, not 0xab: a leading byte with its top bit set makes a negative
        // DER integer, which is not a signature any signer produces.
        const shortR = Buffer.alloc(31, 0x0b);
        // A high top bit makes DER prepend 0x00; JOSE wants the 32 bytes only.
        const signedS = Buffer.concat([Buffer.from([0x00]), Buffer.alloc(32, 0xf1)]);
        const der = Buffer.concat([
            Buffer.from([0x30, 2 + shortR.length + 2 + signedS.length]),
            Buffer.from([0x02, shortR.length]), shortR,
            Buffer.from([0x02, signedS.length]), signedS,
        ]);

        const jose = derSignatureToJose(der);

        expect(jose).toHaveLength(64);
        expect(jose.subarray(0, 32)).toEqual(Buffer.concat([Buffer.alloc(1), shortR]));
        expect(jose.subarray(32)).toEqual(Buffer.alloc(32, 0xf1));
    });

    it('agrees with node:crypto over many real signatures', () =>
    {
        const { privateKey, publicKey } = generateLocalKeyPair('ES256');

        for (let attempt = 0; attempt < 200; attempt += 1)
        {
            const data = Buffer.from(`message-${attempt}`);
            const jose = derSignatureToJose(sign('sha256', data, privateKey));

            expect(jose).toHaveLength(64);
            expect(verify('sha256', data, { key: publicKey, dsaEncoding: 'ieee-p1363' }, jose))
                .toBe(true);
        }
    });

    it('J19: refuses every DER that is not the one canonical encoding', () =>
    {
        const r = Buffer.alloc(32, 0x11);
        const s = Buffer.alloc(32, 0x22);
        const canonical = Buffer.concat([
            Buffer.from([0x30, 0x44, 0x02, 0x20]), r,
            Buffer.from([0x02, 0x20]), s,
        ]);

        // The baseline: this one is the signature, and it converts.
        expect(derSignatureToJose(canonical)).toEqual(Buffer.concat([r, s]));

        const rejected = {
            // A byte after the SEQUENCE, with the length left alone.
            'trailing 00': Buffer.concat([canonical, Buffer.from([0x00])]),
            // The same byte, now inside a SEQUENCE long enough to hold it.
            'trailing 00 inside the length': Buffer.concat([
                Buffer.from([0x30, 0x45, 0x02, 0x20]), r,
                Buffer.from([0x02, 0x20]), s, Buffer.from([0x00]),
            ]),
            'outer length too small': Buffer.concat([
                Buffer.from([0x30, 0x43, 0x02, 0x20]), r, Buffer.from([0x02, 0x20]), s,
            ]),
            'outer length too large': Buffer.concat([
                Buffer.from([0x30, 0x45, 0x02, 0x20]), r, Buffer.from([0x02, 0x20]), s,
            ]),
            // 0x81 0x44 is a second spelling of a length that already had one.
            'long-form outer length': Buffer.concat([
                Buffer.from([0x30, 0x81, 0x44, 0x02, 0x20]), r, Buffer.from([0x02, 0x20]), s,
            ]),
            'long-form INTEGER length': Buffer.concat([
                Buffer.from([0x30, 0x45, 0x02, 0x81, 0x20]), r, Buffer.from([0x02, 0x20]), s,
            ]),
            // 0x00 before a byte whose top bit is clear is a sign byte nothing needed.
            'non-minimal INTEGER': Buffer.concat([
                Buffer.from([0x30, 0x45, 0x02, 0x21, 0x00]), r, Buffer.from([0x02, 0x20]), s,
            ]),
            'r of 33 bytes with no sign byte': Buffer.concat([
                Buffer.from([0x30, 0x45, 0x02, 0x21, 0x01]), Buffer.alloc(32, 0xff),
                Buffer.from([0x02, 0x20]), s,
            ]),
            // A top bit set with no 0x00 in front of it is a negative integer.
            'negative s': Buffer.concat([
                Buffer.from([0x30, 0x44, 0x02, 0x20]), r,
                Buffer.from([0x02, 0x20]), Buffer.alloc(32, 0x99),
            ]),
            'empty INTEGER': Buffer.concat([
                Buffer.from([0x30, 0x24, 0x02, 0x00, 0x02, 0x20]), s,
            ]),
            // The SEQUENCE length adds up; the INTEGER inside it does not.
            'INTEGER running past the end': Buffer.from([0x30, 0x03, 0x02, 0x20, 0x01]),
        };

        for (const [name, der] of Object.entries(rejected))
        {
            // Every complaint names the offset it stopped at.
            expect(() => derSignatureToJose(der), name)
                .toThrow(/Malformed ECDSA DER signature at offset \d+:/);
        }
    });

    it('refuses a signature that is not a DER SEQUENCE of two integers', () =>
    {
        expect(() => derSignatureToJose(Buffer.from([0x31, 0x02, 0x02, 0x00])))
            .toThrow(/SEQUENCE/);
        expect(() => derSignatureToJose(Buffer.from([0x30, 0x04, 0x03, 0x01, 0x00, 0x00])))
            .toThrow(/INTEGER/);
        expect(() => derSignatureToJose(Buffer.concat([
            Buffer.from([0x30, 0x45, 0x02, 0x21, 0x01]), Buffer.alloc(32, 0xff),
            Buffer.from([0x02, 0x20]), Buffer.alloc(32, 0x01),
        ]))).toThrow(/too large/);
    });
});
