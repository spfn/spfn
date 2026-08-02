/**
 * The dev server's test hooks, mirroring the spfn-mobile reference server's
 * `/control` surface route for route so the mobile integration suites can
 * drive either server with only a URL change.
 *
 * `/control` is NOT part of the contract: nothing under it appears in the
 * bundle, no SDK knows it exists, and its answers are plain objects rather
 * than contract envelopes. Every route except the readiness probe requires
 * the per-launch token; the token is never logged.
 *
 * @module server/client-proof/dev-control
 */
import { encodeCanonicalJson, parseCanonicalJson, type CanonicalValue } from './canonical-json';
import { ClientProofState, TestClock } from './state';

export const CONTROL_PREFIX = '/control/';

export const CONTROL_TOKEN_HEADER = 'x-spfn-reference-control';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

const MAX_CONTROL_BODY_BYTES = 4096;

export async function handleControlRequest(
    state: ClientProofState,
    controlToken: string,
    path: string,
    request: Request,
): Promise<Response>
{
    if (path === '/control/health')
    {
        return answer(HTTP_OK, new Map<string, CanonicalValue>([['status', 'ok']]));
    }
    if (request.headers.get(CONTROL_TOKEN_HEADER) !== controlToken)
    {
        return answer(HTTP_FORBIDDEN, failure('control token'));
    }

    const raw = new Uint8Array(await request.arrayBuffer());
    const body = raw.length > MAX_CONTROL_BODY_BYTES ? raw.slice(0, MAX_CONTROL_BODY_BYTES) : raw;

    switch (path)
    {
        case '/control/stats':
            return stats(state);
        case '/control/reset':
            state.reset();

            return ok();
        case '/control/expire-sessions':
            state.expireSessions();

            return ok();
        case '/control/revoke-key':
            return revokeKey(state, body);
        case '/control/session-ttl':
            return sessionTtl(state, body);
        case '/control/hold':
            return hold(state, body);
        case '/control/advance-clock':
            return advanceClock(state, body);
        default:
            return answer(HTTP_NOT_FOUND, failure('unknown control route'));
    }
}

// ---- routes ----------------------------------------------------------------

function stats(state: ClientProofState): Response
{
    const counters = state.stats();

    return answer(HTTP_OK, withOk(new Map<string, CanonicalValue>([
        ['echoCount', BigInt(counters.echoCount)],
        ['handshakeCount', BigInt(counters.handshakeCount)],
        ['itemsListCount', BigInt(counters.itemsListCount)],
        ['liveSessionCount', BigInt(counters.liveSessionCount)],
        ['refusalCount', BigInt(counters.refusalCount)],
        ['requestCount', BigInt(counters.requestCount)],
        ['spentNonceCount', BigInt(counters.spentNonceCount)],
    ])));
}

function revokeKey(state: ClientProofState, body: Uint8Array): Response
{
    const keyId = stringField(body, 'keyId');
    if (keyId === null)
    {
        return badRequest('keyId');
    }
    state.revokeKey(keyId);

    return ok();
}

function sessionTtl(state: ClientProofState, body: Uint8Array): Response
{
    const ttlMillis = integerField(body, 'ttlMillis');
    if (ttlMillis === null)
    {
        return badRequest('ttlMillis');
    }
    state.setSessionTtlMillis(Number(ttlMillis));

    return ok();
}

function hold(state: ClientProofState, body: Uint8Array): Response
{
    const path = stringField(body, 'path');
    const millis = integerField(body, 'millis');
    const count = integerField(body, 'count');
    if (path === null)
    {
        return badRequest('path');
    }
    if (millis === null)
    {
        return badRequest('millis');
    }
    if (count === null)
    {
        return badRequest('count');
    }
    state.holdPath(path, Number(millis), Number(count));

    return ok();
}

/**
 * Moves a test clock forward. Refused when the server runs on the wall clock,
 * because silently doing nothing is how a test passes for the wrong reason.
 */
function advanceClock(state: ClientProofState, body: Uint8Array): Response
{
    const clock = state.clockRef;
    if (!(clock instanceof TestClock))
    {
        return answer(HTTP_CONFLICT, failure('server is running on the system clock'));
    }
    const millis = integerField(body, 'millis');
    if (millis === null)
    {
        return badRequest('millis');
    }
    clock.advance(Number(millis));

    return ok();
}

// ---- plumbing --------------------------------------------------------------

function members(body: Uint8Array): Map<string, CanonicalValue> | null
{
    if (body.length === 0)
    {
        return new Map();
    }
    let parsed: CanonicalValue;
    try
    {
        parsed = parseCanonicalJson(body);
    }
    catch
    {
        return null;
    }

    return parsed instanceof Map ? parsed : null;
}

function stringField(body: Uint8Array, field: string): string | null
{
    const value = members(body)?.get(field);

    return typeof value === 'string' ? value : null;
}

function integerField(body: Uint8Array, field: string): bigint | null
{
    const value = members(body)?.get(field);

    return typeof value === 'bigint' ? value : null;
}

function badRequest(field: string): Response
{
    return answer(HTTP_BAD_REQUEST, failure(`missing or malformed field: ${field}`));
}

function ok(): Response
{
    return answer(HTTP_OK, withOk(new Map()));
}

function failure(reason: string): Map<string, CanonicalValue>
{
    return new Map<string, CanonicalValue>([['ok', false], ['reason', reason]]);
}

function withOk(extra: Map<string, CanonicalValue>): Map<string, CanonicalValue>
{
    extra.set('ok', true);

    return extra;
}

function answer(status: number, value: Map<string, CanonicalValue>): Response
{
    const bytes = encodeCanonicalJson(value);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

    return new Response(buffer, { status, headers: { 'content-type': 'application/json' } });
}
