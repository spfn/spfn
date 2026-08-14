/**
 * HTTP client for an app's ops surface
 *
 * Talks to the running (usually deployed) app: fetches `GET /_ops/_manifest`
 * for command discovery and invokes commands against their declared method
 * and path. The server owns validation — the CLI sends what the operator
 * gave it and relays the server's answer.
 */

export type OpsEffect = 'read' | 'write' | 'destructive';

export interface OpsModuleDescriptor
{
    id: string;
    source: string;
    contractVersion: string;
    summary: string;
}

export interface OpsCommandDescriptor
{
    name: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    module?: string;
    summary?: string;
    effect?: OpsEffect;
    scopes?: string[];
    input: {
        params?: Record<string, unknown>;
        query?: Record<string, unknown>;
        body?: Record<string, unknown>;
    };
}

export interface OpsManifest
{
    manifestVersion: 1;
    modules?: OpsModuleDescriptor[];
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

    const modules = usableModules(manifest.modules);

    return {
        manifestVersion: 1,
        ...(manifest.modules !== undefined ? { modules } : {}),
        commands: usableCommands(manifest.commands, new Set(modules.map(module => module.id))),
    };
}

const OPS_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const OPS_EFFECTS = new Set(['read', 'write', 'destructive']);
const MODULE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const CONTRACT_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)*$/;
const MAX_ID_LENGTH = 64;
const MAX_SOURCE_LENGTH = 128;
const MAX_SUMMARY_LENGTH = 500;
const MAX_SCOPES = 64;
const MAX_SCOPE_LENGTH = 128;

/** Every ops route lives under this prefix — `createOpsRouter` enforces it. */
const OPS_PATH_PREFIX = '/_ops/';
const OPS_PATH_BASE = 'https://spfn.invalid';

function unstableOpsPathBecause(path: string): string | null
{
    let url: URL;
    try
    {
        url = new URL(path, OPS_PATH_BASE);
    }
    catch
    {
        return 'is not a valid URL path';
    }

    if (url.origin !== OPS_PATH_BASE || url.search !== '' || url.hash !== '')
    {
        return 'is not a plain absolute path';
    }
    if (url.pathname !== path)
    {
        return 'changes when URL-normalized';
    }
    if (!url.pathname.startsWith(OPS_PATH_PREFIX))
    {
        return `is outside ${OPS_PATH_PREFIX}`;
    }

    const slashCount = (path.match(/\//g) ?? []).length;
    let decoded = path;
    for (let depth = 0; depth < 8; depth++)
    {
        let next: string;
        try
        {
            next = decodeURIComponent(decoded);
        }
        catch
        {
            return 'contains malformed percent encoding';
        }

        if (next.includes('\\') || (next.match(/\//g) ?? []).length !== slashCount
            || next.split('/').some(segment => segment === '.' || segment === '..'))
        {
            return 'contains encoded path separators or dot segments';
        }
        if (next === decoded)
        {
            return null;
        }
        decoded = next;
    }

    return 'uses too many percent-encoding layers';
}

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
    if (typeof command.path !== 'string')
    {
        return `its path ${JSON.stringify(command.path)} is not a string`;
    }
    const pathReason = unstableOpsPathBecause(command.path);
    if (pathReason !== null)
    {
        return `its path ${JSON.stringify(command.path)} ${pathReason}`;
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
function usableCommands(
    commands: OpsCommandDescriptor[],
    moduleIds: ReadonlySet<string>,
): OpsCommandDescriptor[]
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

        const normalized: OpsCommandDescriptor = {
            name: command.name,
            method: command.method,
            path: command.path,
            input: isPlainObject(command.input) ? command.input : {},
        };
        const metadataReason = unusableModuleMetadataBecause(command, moduleIds);

        if (metadataReason === null && command.module !== undefined)
        {
            normalized.module = command.module;
            normalized.summary = command.summary;
            normalized.effect = command.effect;
            normalized.scopes = [...command.scopes!];
        }
        else if (metadataReason !== null)
        {
            console.error(`⚠️  Ignoring module metadata for ops command "${command.name}": ${metadataReason}.`);
        }

        usable.push(normalized);
    }

    return usable;
}

function unusableModuleMetadataBecause(
    command: OpsCommandDescriptor,
    moduleIds: ReadonlySet<string>,
): string | null
{
    const carriesMetadata = command.module !== undefined
        || command.summary !== undefined
        || command.effect !== undefined
        || command.scopes !== undefined;

    if (!carriesMetadata)
    {
        return null;
    }
    if (typeof command.module !== 'string' || !moduleIds.has(command.module))
    {
        return 'it names no usable module';
    }
    if (!command.name.startsWith(`${command.module}.`))
    {
        return 'its qualified name does not start with the module id';
    }
    if (!command.path.startsWith(`${OPS_PATH_PREFIX}${command.module}/`))
    {
        return 'its path is outside the module namespace';
    }
    if (typeof command.summary !== 'string' || command.summary.length === 0
        || command.summary.length > MAX_SUMMARY_LENGTH)
    {
        return 'its summary is missing or too long';
    }
    if (typeof command.effect !== 'string' || !OPS_EFFECTS.has(command.effect))
    {
        return 'its effect is unknown';
    }
    if (!Array.isArray(command.scopes) || command.scopes.length === 0
        || command.scopes.length > MAX_SCOPES
        || command.scopes.some(scope => typeof scope !== 'string'
            || scope.length === 0 || scope.length > MAX_SCOPE_LENGTH))
    {
        return 'its scopes are missing or invalid';
    }

    return null;
}

function usableModules(value: unknown): OpsModuleDescriptor[]
{
    if (value === undefined)
    {
        return [];
    }
    if (!Array.isArray(value))
    {
        console.error('⚠️  Ignoring ops module metadata: modules is not an array.');

        return [];
    }

    const modules: OpsModuleDescriptor[] = [];
    const claimed = new Set<string>();

    for (const raw of value)
    {
        const reason = unusableModuleBecause(raw, claimed);
        if (reason !== null)
        {
            console.error(`⚠️  Ignoring an ops module the manifest announced: ${reason}.`);
            continue;
        }

        const module = raw as OpsModuleDescriptor;
        claimed.add(module.id);
        modules.push({
            id: module.id,
            source: module.source,
            contractVersion: module.contractVersion,
            summary: module.summary,
        });
    }

    return modules;
}

function unusableModuleBecause(value: unknown, claimed: ReadonlySet<string>): string | null
{
    if (!isPlainObject(value))
    {
        return 'it is not an object';
    }

    const id = value.id;
    if (typeof id !== 'string' || id.length > MAX_ID_LENGTH || !MODULE_ID.test(id))
    {
        return 'its id is invalid';
    }
    if (claimed.has(id))
    {
        return `id "${id}" is duplicated`;
    }
    if (typeof value.source !== 'string' || value.source.length === 0
        || value.source.length > MAX_SOURCE_LENGTH)
    {
        return `module "${id}" has an invalid source`;
    }
    if (typeof value.contractVersion !== 'string' || !CONTRACT_VERSION.test(value.contractVersion))
    {
        return `module "${id}" has an invalid contract version`;
    }
    if (typeof value.summary !== 'string' || value.summary.length === 0
        || value.summary.length > MAX_SUMMARY_LENGTH)
    {
        return `module "${id}" has an invalid summary`;
    }

    return null;
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

        if (value === '.' || value === '..')
        {
            throw new Error(`Path parameter "${name}" cannot be "${value}".`);
        }

        return encodeURIComponent(value);
    });

    const pathReason = unstableOpsPathBecause(path);
    if (pathReason !== null)
    {
        throw new Error(`Refusing ops command path ${JSON.stringify(path)} because it ${pathReason}.`);
    }

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
