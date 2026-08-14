/**
 * Capability ops module contract
 *
 * A package describes commands here, but an adopter application decides
 * whether to mount the resulting module. Definition-time validation keeps an
 * installed package from becoming an ops surface merely by existing, and
 * gives `createOpsRouter` enough metadata to enforce scopes and describe the
 * module to the CLI from one declaration.
 */

import type { RouteDef } from '../route/route-builder';
import { OpsRouterError } from './error';
import { OPS_PATH_ROOT } from './ops-route';
import { opsRoutePatternsOverlap } from './route-overlap';

export type OpsEffect = 'read' | 'write' | 'destructive';

export interface OpsModuleCommand<TRoute extends RouteDef<any> = RouteDef<any>>
{
    summary: string;
    effect: OpsEffect;
    scopes: readonly string[];
    route: TRoute;
}

export interface OpsModule<
    TCommands extends Record<string, OpsModuleCommand<any>> = Record<string, OpsModuleCommand<any>>,
>
{
    id: string;
    source: string;
    contractVersion: string;
    summary: string;
    commands: TCommands;
}

const MODULE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const COMMAND_NAME = /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/;
const CONTRACT_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)*$/;
const EFFECTS = new Set<OpsEffect>(['read', 'write', 'destructive']);
const OPS_PATH_BASE = 'https://spfn.invalid';

function assertText(label: string, value: unknown): asserts value is string
{
    if (typeof value !== 'string' || value.trim().length === 0)
    {
        throw new OpsRouterError(`${label} must be a non-empty string.`);
    }
}

function assertStableModulePath(moduleId: string, commandName: string, path: string): void
{
    const label = `Ops command "${moduleId}.${commandName}" path "${path}"`;
    // Hono path patterns use braces for regex parameters and a trailing `?`
    // for optional ones. Escape those route-language characters before asking
    // WHATWG URL normalization whether the transport-level path moves.
    const transportPath = path.replace(/[{}?#]/g, character =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    let url: URL;
    try
    {
        url = new URL(transportPath, OPS_PATH_BASE);
    }
    catch
    {
        throw new OpsRouterError(`${label} is not a valid URL path.`);
    }

    if (url.origin !== OPS_PATH_BASE || url.search !== '' || url.hash !== '' || url.pathname !== transportPath)
    {
        throw new OpsRouterError(`${label} is not a stable plain absolute path.`);
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
            throw new OpsRouterError(`${label} contains malformed percent encoding.`);
        }

        if (next.includes('\\') || (next.match(/\//g) ?? []).length !== slashCount
            || next.split('/').some(segment => segment === '.' || segment === '..'))
        {
            throw new OpsRouterError(`${label} contains encoded path separators or dot segments.`);
        }
        if (next === decoded)
        {
            return;
        }
        decoded = next;
    }

    throw new OpsRouterError(`${label} uses too many percent-encoding layers.`);
}

function assertCliCallableModulePath(moduleId: string, commandName: string, path: string): void
{
    const unsupported = path.split('/').slice(1).find(segment =>
        segment === '*'
        || segment.includes('*')
        || (segment.startsWith(':')
            ? !/^:[A-Za-z0-9_]+$/.test(segment)
            : !/^[A-Za-z0-9._~-]+$/.test(segment)));

    if (unsupported !== undefined)
    {
        throw new OpsRouterError(
            `Ops command "${moduleId}.${commandName}" path segment "${unsupported}" is not CLI-callable. `
            + 'Module routes support URL-safe static segments and simple :name parameters only; '
            + 'optional, wildcard, and custom-regex parameters are not supported.',
        );
    }
}

function assertCommand(moduleId: string, name: string, command: OpsModuleCommand<any>): void
{
    if (!COMMAND_NAME.test(name))
    {
        throw new OpsRouterError(
            `Ops module "${moduleId}" has invalid command name "${name}". `
            + 'Use dot-separated alphanumeric names.',
        );
    }

    assertText(`Ops command "${moduleId}.${name}" summary`, command?.summary);

    if (!EFFECTS.has(command?.effect))
    {
        throw new OpsRouterError(
            `Ops command "${moduleId}.${name}" has invalid effect ${JSON.stringify(command?.effect)}.`,
        );
    }

    if (!Array.isArray(command?.scopes) || command.scopes.length === 0
        || command.scopes.some(scope => typeof scope !== 'string' || scope.trim().length === 0))
    {
        throw new OpsRouterError(`Ops command "${moduleId}.${name}" must declare at least one non-empty scope.`);
    }

    const route = command?.route;
    if (!route || typeof route.handler !== 'function' || !route.method || !route.path)
    {
        throw new OpsRouterError(`Ops command "${moduleId}.${name}" must carry a complete ops route.`);
    }

    assertStableModulePath(moduleId, name, route.path);
    assertCliCallableModulePath(moduleId, name, route.path);

    const modulePath = `${OPS_PATH_ROOT}/${moduleId}/`;
    if (!route.path.startsWith(modulePath))
    {
        throw new OpsRouterError(
            `Ops command "${moduleId}.${name}" is at "${route.path}", outside "${modulePath}".`,
        );
    }
    if (route.path.split('/').includes('..'))
    {
        throw new OpsRouterError(`Ops command "${moduleId}.${name}" path climbs out of its module namespace.`);
    }
}

/**
 * Validate and return a capability ops module.
 *
 * This function intentionally does not register anything. Only an adopter's
 * explicit `createOpsRouter({ modules: [...] })` composition exposes it.
 */
export function defineOpsModule<
    TCommands extends Record<string, OpsModuleCommand<any>>,
>(module: OpsModule<TCommands>): OpsModule<TCommands>
{
    if (!MODULE_ID.test(module?.id ?? ''))
    {
        throw new OpsRouterError(
            `Ops module id ${JSON.stringify(module?.id)} is invalid. Use lower-kebab-case.`,
        );
    }

    assertText(`Ops module "${module.id}" source`, module.source);
    assertText(`Ops module "${module.id}" summary`, module.summary);

    if (!CONTRACT_VERSION.test(module.contractVersion))
    {
        throw new OpsRouterError(
            `Ops module "${module.id}" contractVersion must be a semantic version.`,
        );
    }

    if (!module.commands || typeof module.commands !== 'object' || Array.isArray(module.commands))
    {
        throw new OpsRouterError(`Ops module "${module.id}" commands must be an object.`);
    }

    const signatures = new Map<string, string>();
    const claimedRoutes: Array<{ name: string; method: string; path: string }> = [];
    for (const [name, command] of Object.entries(module.commands))
    {
        assertCommand(module.id, name, command);

        const signature = `${command.route.method} ${command.route.path}`;
        const existing = signatures.get(signature);
        if (existing)
        {
            throw new OpsRouterError(
                `Ops module "${module.id}" commands "${existing}" and "${name}" both use ${signature}.`,
            );
        }
        signatures.set(signature, name);

        const overlapping = claimedRoutes.find(claim =>
            claim.method === command.route.method
            && opsRoutePatternsOverlap(claim.path, command.route.path!));
        if (overlapping)
        {
            throw new OpsRouterError(
                `Ops module "${module.id}" commands "${overlapping.name}" and "${name}" `
                + `have overlapping ${command.route.method} routes `
                + `("${overlapping.path}" and "${command.route.path}").`,
            );
        }
        claimedRoutes.push({
            name,
            method: command.route.method!,
            path: command.route.path!,
        });
    }

    return module;
}
