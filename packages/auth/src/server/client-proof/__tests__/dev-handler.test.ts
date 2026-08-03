/**
 * The dev surface end to end: the wire fixture's exact requests through the
 * fetch handler, the reference server's refusal semantics, session lifecycle
 * (TTL expiry → re-handshake), and the /control hooks the mobile integration
 * suites drive.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { CLIENT_PROOF_HEADERS } from '../admission';
import { parseCanonicalJson, type CanonicalObject } from '../canonical-json';
import { sha256Hex, signClientProof } from '../proof';
import { CONTROL_TOKEN_HEADER } from '../dev-control';
import {
    createClientProofDevHandler,
    type ClientProofDevHandler,
} from '../dev-handler';
import { TestClock } from '../state';
import {
    OTHER_KEY_ID,
    OTHER_PRIVATE_KEY_PKCS8_B64,
    OTHER_PUBLIC_KEY_SPKI_B64,
    TEST_PRIVATE_KEY_PKCS8_B64,
    TEST_PUBLIC_KEYS,
} from './test-keys';

const FIXTURES = join(__dirname, 'fixtures');

const utf8 = new TextEncoder();

const KEY_ID = 'key-test-0001';
const CLIENT_ID = 'client-test-0001';

const BASE_URL = 'http://127.0.0.1';
const NOW = 1_750_000_000_000;

interface WireVector
{
    name: string;
    method: string;
    path: string;
    requiresSession: boolean;
    sessionId: string | null;
    canonicalBody: string;
    bodySha256: string;
    proof: string;
    headers: [string, string][];
}

function makeHandler(clock = new TestClock(NOW)): { handler: ClientProofDevHandler; clock: TestClock }
{
    const handler = createClientProofDevHandler({ publicKeys: TEST_PUBLIC_KEYS, clock });

    return { handler, clock };
}

function contractRequest(args: {
    path: string;
    body: string;
    nonce: string;
    issuedAtMillis?: bigint;
    sessionId?: string;
    keyId?: string;
    privateKey?: string;
    overrideHeaders?: Record<string, string | null>;
}): Request
{
    const bodyBytes = utf8.encode(args.body);
    const issuedAtMillis = args.issuedAtMillis ?? BigInt(NOW);
    const keyId = args.keyId ?? KEY_ID;
    const proof = signClientProof(
        {
            method: 'POST',
            path: args.path,
            clientId: CLIENT_ID,
            keyId,
            nonce: args.nonce,
            issuedAtMillis,
            bodySha256: sha256Hex(bodyBytes),
        },
        args.privateKey ?? TEST_PRIVATE_KEY_PKCS8_B64,
    );
    const headers = new Headers({
        'content-type': 'application/json',
        [CLIENT_PROOF_HEADERS.profile]: 'clientProofV1',
        [CLIENT_PROOF_HEADERS.clientId]: CLIENT_ID,
        [CLIENT_PROOF_HEADERS.keyId]: keyId,
        [CLIENT_PROOF_HEADERS.nonce]: args.nonce,
        [CLIENT_PROOF_HEADERS.issuedAtMillis]: issuedAtMillis.toString(),
        [CLIENT_PROOF_HEADERS.proof]: proof,
    });
    if (args.sessionId !== undefined)
    {
        headers.set(CLIENT_PROOF_HEADERS.session, args.sessionId);
    }
    for (const [name, value] of Object.entries(args.overrideHeaders ?? {}))
    {
        if (value === null)
        {
            headers.delete(name);
        }
        else
        {
            headers.set(name, value);
        }
    }

    return new Request(`${BASE_URL}${args.path}`, { method: 'POST', headers, body: bodyBytes });
}

async function errorCode(response: Response): Promise<string>
{
    const parsed = parseCanonicalJson(new Uint8Array(await response.arrayBuffer())) as CanonicalObject;
    const error = parsed.get('error') as CanonicalObject;

    return error.get('code') as string;
}

async function handshake(handler: ClientProofDevHandler, nonce: string): Promise<string>
{
    const body = `{"clientId":"${CLIENT_ID}","issuedAtMillis":${NOW},"keyId":"${KEY_ID}","nonce":"${nonce}"}`;
    const response = await handler.fetch(contractRequest({
        path: '/v1/auth/client-proof/handshake',
        body,
        nonce,
    }));
    expect(response.status).toBe(200);
    const parsed = parseCanonicalJson(new Uint8Array(await response.arrayBuffer())) as CanonicalObject;

    return parsed.get('sessionId') as string;
}

// ---------------------------------------------------------------------------

describe('wire-fixture round trips', () =>
{
    const wire = JSON.parse(readFileSync(join(FIXTURES, 'request/wire.json'), 'utf8')) as {
        headerNames: Record<string, string>;
        vectors: WireVector[];
    };

    it('the fixture header names are the ratified D23 names', () =>
    {
        expect(wire.headerNames).toEqual(CLIENT_PROOF_HEADERS);
    });

    // The fixture's pinned x-spfn-proof values are HMAC and retired: an ECDSA
    // signature is random per run, so each vector's proof header is re-signed
    // here with the fixed test keypair. Everything else — body bytes, digest,
    // header names and values — is presented exactly as vendored.
    it.each(wire.vectors.map((v) => [v.name, v] as const))('%s: fixture bytes with a re-signed proof are admitted', async (_, vector) =>
    {
        const { handler } = makeHandler();
        if (vector.sessionId !== null)
        {
            handler.state.seedSession(vector.sessionId, CLIENT_ID, KEY_ID, NOW + 600_000);
        }
        const bodyBytes = utf8.encode(vector.canonicalBody);
        expect(sha256Hex(bodyBytes)).toBe(vector.bodySha256);
        const headers = new Headers(vector.headers);
        headers.set(CLIENT_PROOF_HEADERS.proof, signClientProof(
            {
                method: vector.method,
                path: vector.path,
                clientId: headers.get(CLIENT_PROOF_HEADERS.clientId)!,
                keyId: headers.get(CLIENT_PROOF_HEADERS.keyId)!,
                nonce: headers.get(CLIENT_PROOF_HEADERS.nonce)!,
                issuedAtMillis: BigInt(headers.get(CLIENT_PROOF_HEADERS.issuedAtMillis)!),
                bodySha256: vector.bodySha256,
            },
            TEST_PRIVATE_KEY_PKCS8_B64,
        ));
        const response = await handler.fetch(new Request(`${BASE_URL}${vector.path}`, {
            method: vector.method,
            headers,
            body: bodyBytes,
        }));
        expect(response.status).toBe(200);
        const parsed = parseCanonicalJson(new Uint8Array(await response.arrayBuffer())) as CanonicalObject;
        if (vector.name === 'handshake')
        {
            expect(typeof parsed.get('sessionId')).toBe('string');
            expect(parsed.get('expiresAtMillis')).toBe(BigInt(NOW + 600_000));
        }
        else
        {
            expect(parsed.get('message')).toBe('hello');
            expect(parsed.get('sequence')).toBe(7n);
            expect(parsed.get('serverTimeMillis')).toBe(BigInt(NOW));
        }
    });
});

// ---------------------------------------------------------------------------

describe('refusal semantics', () =>
{
    let handler: ClientProofDevHandler;
    let clock: TestClock;

    beforeEach(() =>
    {
        ({ handler, clock } = makeHandler());
    });

    const ECHO_BODY = '{"message":"hello","sequence":7}';

    it('unknown method/path is CONTRACT_UNSUPPORTED 409', async () =>
    {
        const response = await handler.fetch(new Request(`${BASE_URL}/v1/nope`, { method: 'POST' }));
        expect(response.status).toBe(409);
        expect(await errorCode(response)).toBe('CONTRACT_UNSUPPORTED');
    });

    it('a query string makes a contract path unroutable', async () =>
    {
        const sessionId = await handshake(handler, 'nonce-query-01');
        const request = contractRequest({ path: '/v1/echo', body: ECHO_BODY, nonce: 'nonce-query-02', sessionId });
        const withQuery = new Request(`${BASE_URL}/v1/echo?x=1`, {
            method: 'POST',
            headers: request.headers,
            body: utf8.encode(ECHO_BODY),
        });
        const response = await handler.fetch(withQuery);
        expect(response.status).toBe(409);
        expect(await errorCode(response)).toBe('CONTRACT_UNSUPPORTED');
    });

    it('a missing contract header is CONTRACT_UNSUPPORTED', async () =>
    {
        const sessionId = await handshake(handler, 'nonce-header-01');
        const response = await handler.fetch(contractRequest({
            path: '/v1/echo',
            body: ECHO_BODY,
            nonce: 'nonce-header-02',
            sessionId,
            overrideHeaders: { [CLIENT_PROOF_HEADERS.nonce]: null },
        }));
        expect(response.status).toBe(409);
        expect(await errorCode(response)).toBe('CONTRACT_UNSUPPORTED');
    });

    it('an unknown auth profile is PROFILE_REJECTED 400', async () =>
    {
        const sessionId = await handshake(handler, 'nonce-profile-01');
        const response = await handler.fetch(contractRequest({
            path: '/v1/echo',
            body: ECHO_BODY,
            nonce: 'nonce-profile-02',
            sessionId,
            overrideHeaders: { [CLIENT_PROOF_HEADERS.profile]: 'oidcPkceV1' },
        }));
        expect(response.status).toBe(400);
        expect(await errorCode(response)).toBe('PROFILE_REJECTED');
    });

    it('a session header on the handshake is misplaced', async () =>
    {
        const body = `{"clientId":"${CLIENT_ID}","issuedAtMillis":${NOW},"keyId":"${KEY_ID}","nonce":"nonce-misplace-01"}`;
        const response = await handler.fetch(contractRequest({
            path: '/v1/auth/client-proof/handshake',
            body,
            nonce: 'nonce-misplace-01',
            sessionId: 'session-not-allowed',
        }));
        expect(response.status).toBe(409);
        expect(await errorCode(response)).toBe('CONTRACT_UNSUPPORTED');
    });

    it('a parsable but non-canonical body is refused even with a valid proof', async () =>
    {
        const sessionId = await handshake(handler, 'nonce-canon-01');
        const nonCanonical = '{"sequence":7,"message":"hello"}';
        const response = await handler.fetch(contractRequest({
            path: '/v1/echo',
            body: nonCanonical,
            nonce: 'nonce-canon-02',
            sessionId,
        }));
        expect(response.status).toBe(409);
        expect(await errorCode(response)).toBe('CONTRACT_UNSUPPORTED');
    });

    it('canonical JSON that is not the declared type is refused', async () =>
    {
        const sessionId = await handshake(handler, 'nonce-type-01');
        const response = await handler.fetch(contractRequest({
            path: '/v1/echo',
            body: '{"message":"hello"}',
            nonce: 'nonce-type-02',
            sessionId,
        }));
        expect(response.status).toBe(409);
        expect(await errorCode(response)).toBe('CONTRACT_UNSUPPORTED');
    });

    it('a handshake body naming another client is refused', async () =>
    {
        const body = `{"clientId":"client-other","issuedAtMillis":${NOW},"keyId":"${KEY_ID}","nonce":"nonce-cross-01"}`;
        const response = await handler.fetch(contractRequest({
            path: '/v1/auth/client-proof/handshake',
            body,
            nonce: 'nonce-cross-01',
        }));
        expect(response.status).toBe(409);
        expect(await errorCode(response)).toBe('CONTRACT_UNSUPPORTED');
    });

    it('an unregistered keyId is PROOF_INVALID, not SESSION_REVOKED', async () =>
    {
        const body = `{"clientId":"${CLIENT_ID}","issuedAtMillis":${NOW},"keyId":"key-unknown","nonce":"nonce-unknown-01"}`;
        const bodyBytes = utf8.encode(body);
        const proof = signClientProof(
            {
                method: 'POST',
                path: '/v1/auth/client-proof/handshake',
                clientId: CLIENT_ID,
                keyId: 'key-unknown',
                nonce: 'nonce-unknown-01',
                issuedAtMillis: BigInt(NOW),
                bodySha256: sha256Hex(bodyBytes),
            },
            TEST_PRIVATE_KEY_PKCS8_B64,
        );
        const response = await handler.fetch(new Request(`${BASE_URL}/v1/auth/client-proof/handshake`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                [CLIENT_PROOF_HEADERS.profile]: 'clientProofV1',
                [CLIENT_PROOF_HEADERS.clientId]: CLIENT_ID,
                [CLIENT_PROOF_HEADERS.keyId]: 'key-unknown',
                [CLIENT_PROOF_HEADERS.nonce]: 'nonce-unknown-01',
                [CLIENT_PROOF_HEADERS.issuedAtMillis]: String(NOW),
                [CLIENT_PROOF_HEADERS.proof]: proof,
            },
            body: bodyBytes,
        }));
        expect(response.status).toBe(401);
        expect(await errorCode(response)).toBe('PROOF_INVALID');
    });

    it('an expired session is SESSION_REVOKED and one re-handshake recovers', async () =>
    {
        handler.state.setSessionTtlMillis(1_000);
        const sessionId = await handshake(handler, 'nonce-ttl-01');
        clock.advance(2_000);

        const refused = await handler.fetch(contractRequest({
            path: '/v1/echo',
            body: ECHO_BODY,
            nonce: 'nonce-ttl-02',
            issuedAtMillis: BigInt(NOW + 2_000),
            sessionId,
        }));
        expect(refused.status).toBe(401);
        expect(await errorCode(refused)).toBe('SESSION_REVOKED');

        const freshBody = `{"clientId":"${CLIENT_ID}","issuedAtMillis":${NOW + 2_000},"keyId":"${KEY_ID}","nonce":"nonce-ttl-03"}`;
        const reHandshake = await handler.fetch(contractRequest({
            path: '/v1/auth/client-proof/handshake',
            body: freshBody,
            nonce: 'nonce-ttl-03',
            issuedAtMillis: BigInt(NOW + 2_000),
        }));
        expect(reHandshake.status).toBe(200);
        const parsed = parseCanonicalJson(new Uint8Array(await reHandshake.arrayBuffer())) as CanonicalObject;
        const freshSession = parsed.get('sessionId') as string;

        const recovered = await handler.fetch(contractRequest({
            path: '/v1/echo',
            body: ECHO_BODY,
            nonce: 'nonce-ttl-04',
            issuedAtMillis: BigInt(NOW + 2_000),
            sessionId: freshSession,
        }));
        expect(recovered.status).toBe(200);
    });
});

// ---------------------------------------------------------------------------

describe('items.list paging', () =>
{
    it('pages the fixed catalogue by cursor and omits nextCursor on the last page', async () =>
    {
        const { handler } = makeHandler();
        const sessionId = await handshake(handler, 'nonce-page-01');

        const first = await handler.fetch(contractRequest({
            path: '/v1/items/list',
            body: '{"limit":2}',
            nonce: 'nonce-page-02',
            sessionId,
        }));
        expect(first.status).toBe(200);
        const firstPage = parseCanonicalJson(new Uint8Array(await first.arrayBuffer())) as CanonicalObject;
        expect((firstPage.get('items') as unknown[]).length).toBe(2);
        expect(firstPage.get('nextCursor')).toBe('item-0002');

        const last = await handler.fetch(contractRequest({
            path: '/v1/items/list',
            body: '{"cursor":"item-0002","limit":100}',
            nonce: 'nonce-page-03',
            sessionId,
        }));
        expect(last.status).toBe(200);
        const lastPage = parseCanonicalJson(new Uint8Array(await last.arrayBuffer())) as CanonicalObject;
        expect((lastPage.get('items') as unknown[]).length).toBe(3);
        expect(lastPage.has('nextCursor')).toBe(false);
    });

    it('an unknown cursor and an out-of-range limit are refused, not repaired', async () =>
    {
        const { handler } = makeHandler();
        const sessionId = await handshake(handler, 'nonce-page-04');

        const unknownCursor = await handler.fetch(contractRequest({
            path: '/v1/items/list',
            body: '{"cursor":"item-9999","limit":10}',
            nonce: 'nonce-page-05',
            sessionId,
        }));
        expect(await errorCode(unknownCursor)).toBe('CONTRACT_UNSUPPORTED');

        const zeroLimit = await handler.fetch(contractRequest({
            path: '/v1/items/list',
            body: '{"limit":0}',
            nonce: 'nonce-page-06',
            sessionId,
        }));
        expect(await errorCode(zeroLimit)).toBe('CONTRACT_UNSUPPORTED');
    });
});

// ---------------------------------------------------------------------------

describe('/control surface', () =>
{
    it('health needs no token; every other route rejects a wrong token', async () =>
    {
        const { handler } = makeHandler();
        const health = await handler.fetch(new Request(`${BASE_URL}/control/health`, { method: 'POST' }));
        expect(health.status).toBe(200);

        const forbidden = await handler.fetch(new Request(`${BASE_URL}/control/stats`, {
            method: 'POST',
            headers: { [CONTROL_TOKEN_HEADER]: 'wrong' },
        }));
        expect(forbidden.status).toBe(403);
    });

    it('revoke-key drops the key and its sessions; stats counts activity', async () =>
    {
        const { handler } = makeHandler();
        const sessionId = await handshake(handler, 'nonce-ctl-01');

        const revoke = await handler.fetch(new Request(`${BASE_URL}/control/revoke-key`, {
            method: 'POST',
            headers: { [CONTROL_TOKEN_HEADER]: handler.controlToken },
            body: `{"keyId":"${KEY_ID}"}`,
        }));
        expect(revoke.status).toBe(200);

        const refused = await handler.fetch(contractRequest({
            path: '/v1/echo',
            body: '{"message":"hello","sequence":7}',
            nonce: 'nonce-ctl-02',
            sessionId,
        }));
        expect(refused.status).toBe(401);
        expect(await errorCode(refused)).toBe('SESSION_REVOKED');

        const stats = await handler.fetch(new Request(`${BASE_URL}/control/stats`, {
            method: 'POST',
            headers: { [CONTROL_TOKEN_HEADER]: handler.controlToken },
        }));
        const parsed = parseCanonicalJson(new Uint8Array(await stats.arrayBuffer())) as CanonicalObject;
        expect(parsed.get('handshakeCount')).toBe(1n);
        expect(parsed.get('refusalCount')).toBe(1n);
    });

    it('register-key admits proofs under a newly registered public key', async () =>
    {
        const { handler } = makeHandler();

        const before = await handler.fetch(contractRequest({
            path: '/v1/auth/client-proof/handshake',
            body: `{"clientId":"${CLIENT_ID}","issuedAtMillis":${NOW},"keyId":"${OTHER_KEY_ID}","nonce":"nonce-reg-01"}`,
            nonce: 'nonce-reg-01',
            keyId: OTHER_KEY_ID,
            privateKey: OTHER_PRIVATE_KEY_PKCS8_B64,
        }));
        expect(before.status).toBe(401);
        expect(await errorCode(before)).toBe('PROOF_INVALID');

        const register = await handler.fetch(new Request(`${BASE_URL}/control/register-key`, {
            method: 'POST',
            headers: { [CONTROL_TOKEN_HEADER]: handler.controlToken },
            body: `{"keyId":"${OTHER_KEY_ID}","publicKey":"${OTHER_PUBLIC_KEY_SPKI_B64}"}`,
        }));
        expect(register.status).toBe(200);

        const after = await handler.fetch(contractRequest({
            path: '/v1/auth/client-proof/handshake',
            body: `{"clientId":"${CLIENT_ID}","issuedAtMillis":${NOW},"keyId":"${OTHER_KEY_ID}","nonce":"nonce-reg-02"}`,
            nonce: 'nonce-reg-02',
            keyId: OTHER_KEY_ID,
            privateKey: OTHER_PRIVATE_KEY_PKCS8_B64,
        }));
        expect(after.status).toBe(200);
    });

    it('register-key refuses a value that is not a P-256 SPKI public key', async () =>
    {
        const { handler } = makeHandler();
        const response = await handler.fetch(new Request(`${BASE_URL}/control/register-key`, {
            method: 'POST',
            headers: { [CONTROL_TOKEN_HEADER]: handler.controlToken },
            body: `{"keyId":"${OTHER_KEY_ID}","publicKey":"bm90IGEga2V5"}`,
        }));
        expect(response.status).toBe(400);
    });

    it('reset drops keys registered at runtime and keeps the constructed ones', async () =>
    {
        const { handler } = makeHandler();
        await handler.fetch(new Request(`${BASE_URL}/control/register-key`, {
            method: 'POST',
            headers: { [CONTROL_TOKEN_HEADER]: handler.controlToken },
            body: `{"keyId":"${OTHER_KEY_ID}","publicKey":"${OTHER_PUBLIC_KEY_SPKI_B64}"}`,
        }));
        handler.state.reset();

        const dropped = await handler.fetch(contractRequest({
            path: '/v1/auth/client-proof/handshake',
            body: `{"clientId":"${CLIENT_ID}","issuedAtMillis":${NOW},"keyId":"${OTHER_KEY_ID}","nonce":"nonce-reg-03"}`,
            nonce: 'nonce-reg-03',
            keyId: OTHER_KEY_ID,
            privateKey: OTHER_PRIVATE_KEY_PKCS8_B64,
        }));
        expect(await errorCode(dropped)).toBe('PROOF_INVALID');

        const kept = await handshake(handler, 'nonce-reg-04');
        expect(typeof kept).toBe('string');
    });

    it('advance-clock moves a test clock and expires sessions for real', async () =>
    {
        const { handler } = makeHandler();
        handler.state.setSessionTtlMillis(1_000);
        const sessionId = await handshake(handler, 'nonce-ctl-03');

        const advance = await handler.fetch(new Request(`${BASE_URL}/control/advance-clock`, {
            method: 'POST',
            headers: { [CONTROL_TOKEN_HEADER]: handler.controlToken },
            body: '{"millis":5000}',
        }));
        expect(advance.status).toBe(200);

        const refused = await handler.fetch(contractRequest({
            path: '/v1/echo',
            body: '{"message":"hello","sequence":7}',
            nonce: 'nonce-ctl-04',
            issuedAtMillis: BigInt(NOW + 5_000),
            sessionId,
        }));
        expect(await errorCode(refused)).toBe('SESSION_REVOKED');
    });

    it('hold delays the next request to a path', async () =>
    {
        const { handler } = makeHandler();
        const hold = await handler.fetch(new Request(`${BASE_URL}/control/hold`, {
            method: 'POST',
            headers: { [CONTROL_TOKEN_HEADER]: handler.controlToken },
            body: '{"count":1,"millis":30,"path":"/v1/echo"}',
        }));
        expect(hold.status).toBe(200);

        const sessionId = await handshake(handler, 'nonce-hold-01');
        const started = Date.now();
        const response = await handler.fetch(contractRequest({
            path: '/v1/echo',
            body: '{"message":"hello","sequence":7}',
            nonce: 'nonce-hold-02',
            sessionId,
        }));
        expect(response.status).toBe(200);
        expect(Date.now() - started).toBeGreaterThanOrEqual(25);
    });
});
