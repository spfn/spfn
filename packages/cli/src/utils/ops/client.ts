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

/**
 * Append an absolute path to the app URL, keeping whatever base path the
 * operator gave.
 *
 * Concatenation rather than `new URL(path, appUrl)`, because an absolute path
 * resolved against a base replaces it: an app mounted at
 * `https://example.com/api` would be called at `https://example.com/_ops/...`.
 * Every request the CLI makes goes through here so the two halves of the
 * surface — the ops calls and the administrator sign-in — agree about where
 * the app is.
 */
export function joinUrl(appUrl: string, path: string): string
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

    return { manifestVersion: 1, commands: usableCommands(manifest.commands) };
}

const OPS_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

/** Every ops route lives under this prefix — `createOpsRouter` enforces it. */
const OPS_PATH_PREFIX = '/_ops/';

/**
 * Why a command cannot be used, or null when it can.
 *
 * The manifest is the app's own description of itself, and the CLI turns it
 * into a request carrying an ops token — so a command is checked before it can
 * become one, rather than trusted and allowed to fail as a stack trace deep in
 * `fetch`. The path rule is the server's own: `createOpsRouter` refuses a route
 * outside `/_ops/`, so anything else here did not come from it.
 */
function unusableBecause(command: OpsCommandDescriptor): string | null
{
    if (typeof command?.name !== 'string' || command.name.length === 0)
    {
        return 'it has no name';
    }
    if (typeof command.method !== 'string' || !OPS_METHODS.has(command.method))
    {
        return `its method is ${JSON.stringify(command.method)}`;
    }
    if (typeof command.path !== 'string' || !command.path.startsWith(OPS_PATH_PREFIX))
    {
        return `its path ${JSON.stringify(command.path)} is outside ${OPS_PATH_PREFIX}`;
    }
    if (command.path.split('/').includes('..'))
    {
        return `its path ${JSON.stringify(command.path)} climbs out of the ops namespace`;
    }

    return null;
}

/**
 * Keep the commands the CLI can invoke and say which it dropped.
 *
 * Dropping rather than refusing the whole manifest: a newer server may announce
 * something this CLI has no way to call, and one such command must not cost the
 * operator every other command on the surface. Silence would be worse than
 * either — an operator would read a short list as the app's whole surface.
 */
function usableCommands(commands: OpsCommandDescriptor[]): OpsCommandDescriptor[]
{
    const usable: OpsCommandDescriptor[] = [];

    for (const command of commands)
    {
        const reason = unusableBecause(command);

        if (reason !== null)
        {
            console.error(`⚠️  Ignoring an ops command the manifest announced: ${reason}.`);
            continue;
        }

        usable.push({ ...command, input: isPlainObject(command.input) ? command.input : {} });
    }

    return usable;
}

function isPlainObject(value: unknown): value is Record<string, unknown>
{
    return value !== null && typeof value === 'object' && !Array.isArray(value);
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
