/**
 * The one place `spfn kit` talks to a network, and the rules that hold there.
 *
 * Three of them are worth stating, because every client below depends on all
 * three and none of them can be added later:
 *
 *   - a request body may hold a licence key or a local credential, so no error
 *     raised here ever quotes one. What a failure is allowed to carry is the
 *     method, the origin, the path and the status — never the body it sent and
 *     never the body it got back;
 *   - a response is a stranger's bytes. It is read with a ceiling on its size
 *     and a deadline on its arrival, so an origin that answers slowly or
 *     endlessly stops the command instead of hanging it;
 *   - "the service said no" and "the service could not be reached" are
 *     different answers. A transport failure becomes `CLI_...`, because it is a
 *     fact about this machine's connection rather than about the licence.
 */

import { KitError } from '../errors.js';

/** Long enough for a cold control plane, short enough to fail a hung one. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** A JSON control-plane answer is small. Anything larger is not one. */
export const MAX_JSON_BYTES = 1_048_576;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface KitHttpOptions
{
    /** Injected so tests reach a local fixture and nothing else. */
    fetchImpl?: FetchLike;
    timeoutMs?: number;
}

export interface KitHttpResponse
{
    status: number;
    /** Parsed JSON, or null when the body was absent or not JSON. */
    body: Record<string, unknown> | null;
}

export interface KitHttpRequest
{
    method: 'GET' | 'POST';
    url: string;
    /** Serialized as JSON. May hold secrets; never appears in an error. */
    json?: unknown;
    /** Bearer credential for the registry proxy. Never logged. */
    bearer?: string;
    accept?: string;
}

/**
 * A JSON request and its parsed answer.
 *
 * A non-2xx status is *returned*, not thrown: which statuses mean what is the
 * caller's contract, and a client that has to catch an exception to read a
 * documented 409 ends up with two ways of expressing the same outcome.
 */
export async function requestJson(request: KitHttpRequest, options: KitHttpOptions = {}): Promise<KitHttpResponse>
{
    const response = await send(request, options);
    const text = await readCapped(response, request);

    if (text.length === 0)
    {
        return { status: response.status, body: null };
    }

    try
    {
        const parsed = JSON.parse(text);

        return {
            status: response.status,
            body: typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
                ? parsed as Record<string, unknown>
                : null,
        };
    }
    catch
    {
        return { status: response.status, body: null };
    }
}

/** A binary request — a tarball or a release artifact — and its bytes. */
export async function requestBytes(
    request: KitHttpRequest,
    maxBytes: number,
    options: KitHttpOptions = {},
): Promise<{ status: number; bytes: Uint8Array }>
{
    const response = await send(request, options);
    const declared = Number(response.headers.get('content-length') ?? '0');

    if (declared > maxBytes)
    {
        throw unavailable(request, 'response-too-large', { declaredBytes: declared, maxBytes });
    }

    const buffer = new Uint8Array(await response.arrayBuffer().catch(() =>
    {
        throw unavailable(request, 'body-unreadable');
    }));

    if (buffer.byteLength > maxBytes)
    {
        throw unavailable(request, 'response-too-large', { bytes: buffer.byteLength, maxBytes });
    }

    return { status: response.status, bytes: buffer };
}

async function send(request: KitHttpRequest, options: KitHttpOptions): Promise<Response>
{
    const call = options.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);

    if (call === undefined)
    {
        throw unavailable(request, 'no-fetch-in-runtime');
    }

    const headers: Record<string, string> = { accept: request.accept ?? 'application/json' };

    if (request.json !== undefined)
    {
        headers['content-type'] = 'application/json';
    }
    if (request.bearer !== undefined)
    {
        headers.authorization = `Bearer ${request.bearer}`;
    }

    try
    {
        return await call(request.url, {
            method: request.method,
            headers,
            body: request.json === undefined ? undefined : JSON.stringify(request.json),
            signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
            redirect: 'follow',
        });
    }
    catch (error)
    {
        // The cause is deliberately dropped rather than attached: a fetch error
        // can quote the request it failed on, and that request held a secret.
        throw unavailable(request, isTimeout(error) ? 'timeout' : 'unreachable');
    }
}

async function readCapped(response: Response, request: KitHttpRequest): Promise<string>
{
    const declared = Number(response.headers.get('content-length') ?? '0');

    if (declared > MAX_JSON_BYTES)
    {
        throw unavailable(request, 'response-too-large', { declaredBytes: declared, maxBytes: MAX_JSON_BYTES });
    }

    const text = await response.text().catch(() =>
    {
        throw unavailable(request, 'body-unreadable');
    });

    if (text.length > MAX_JSON_BYTES)
    {
        throw unavailable(request, 'response-too-large', { bytes: text.length, maxBytes: MAX_JSON_BYTES });
    }

    return text;
}

function isTimeout(error: unknown): boolean
{
    return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

/**
 * Evidence about a request, with nothing of the request in it.
 *
 * The origin and the path are safe: a Kit URL is a public locator, refused
 * earlier if it carried a query or a fragment. The body is not, and is absent.
 */
export function requestEvidence(request: KitHttpRequest): Record<string, string>
{
    let origin = 'unparseable';
    let path = 'unparseable';

    try
    {
        const url = new URL(request.url);

        origin = url.origin;
        path = url.pathname;
    }
    catch
    {
        // Left as `unparseable`; a URL this client built and cannot parse is
        // itself the fact worth reporting.
    }

    return { method: request.method, origin, path };
}

export function unavailable(
    request: KitHttpRequest,
    reason: string,
    extra: Record<string, string | number | boolean | null> = {},
): KitError
{
    return new KitError('CLI_CONTROL_PLANE_UNAVAILABLE', 'A Superfunction service could not be reached.', {
        evidence: { reason, ...requestEvidence(request), ...extra },
    });
}
