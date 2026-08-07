/**
 * HTTP client for an app's ops surface
 *
 * Talks to the running (usually deployed) app: fetches `GET /_ops/_manifest`
 * for command discovery and invokes commands against their declared method
 * and path. The server owns validation — the CLI sends what the operator
 * gave it and relays the server's answer.
 */

export interface OpsCommandDescriptor
{
    name: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    input: {
        params?: Record<string, unknown>;
        query?: Record<string, unknown>;
        body?: Record<string, unknown>;
    };
}

export interface OpsManifest
{
    manifestVersion: 1;
    commands: OpsCommandDescriptor[];
}

export interface OpsCallInput
{
    params: Record<string, string>;
    query: Record<string, string>;
    body: unknown | undefined;
}

export interface OpsResponse
{
    status: number;
    body: unknown;
}

function joinUrl(appUrl: string, path: string): string
{
    return appUrl.replace(/\/+$/, '') + path;
}

async function request(
    appUrl: string,
    token: string,
    method: string,
    path: string,
    body?: unknown,
): Promise<OpsResponse>
{
    const response = await fetch(joinUrl(appUrl, path), {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const text = await response.text();
    let parsed: unknown = text;
    try
    {
        parsed = text.length > 0 ? JSON.parse(text) : null;
    }
    catch
    {
        // Non-JSON answer (proxy error page, ...) — relay as text.
    }

    return { status: response.status, body: parsed };
}

export async function fetchOpsManifest(appUrl: string, token: string): Promise<OpsManifest>
{
    const { status, body } = await request(appUrl, token, 'GET', '/_ops/_manifest');

    if (status === 401 || status === 403)
    {
        throw new Error('The app refused the ops token (check --token / SPFN_OPS_TOKEN / keychain).');
    }
    if (status === 404)
    {
        throw new Error('No ops surface at this app (GET /_ops/_manifest answered 404). '
            + 'Mount one with createOpsRouter() and .packages([opsRouter]).');
    }
    if (status !== 200)
    {
        throw new Error(`Manifest request failed with status ${status}.`);
    }

    const manifest = body as OpsManifest;
    if (manifest?.manifestVersion !== 1 || !Array.isArray(manifest.commands))
    {
        throw new Error('The manifest answer has an unknown shape.');
    }

    return manifest;
}

/**
 * Substitute `:name` segments from params. A missing parameter fails here,
 * before any request leaves the machine.
 */
export function buildCommandPath(
    command: OpsCommandDescriptor,
    params: Record<string, string>,
    query: Record<string, string>,
): string
{
    const path = command.path.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) =>
    {
        const value = params[name];
        if (value === undefined)
        {
            throw new Error(`Missing path parameter "${name}" (pass --param ${name}=<value>).`);
        }

        return encodeURIComponent(value);
    });

    const search = new URLSearchParams(query).toString();

    return search.length > 0 ? `${path}?${search}` : path;
}

export async function invokeOpsCommand(
    appUrl: string,
    token: string,
    command: OpsCommandDescriptor,
    input: OpsCallInput,
): Promise<OpsResponse>
{
    const path = buildCommandPath(command, input.params, input.query);

    return await request(appUrl, token, command.method, path, input.body);
}
