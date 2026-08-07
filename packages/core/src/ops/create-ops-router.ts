/**
 * Ops Router
 *
 * The structure half of SPFN's CLI-first operations surface. An app develops
 * its own ops as ordinary routes — domain operations only that app can name —
 * and this factory turns them into a mountable package router that:
 *
 * - enforces the `/_ops/` path prefix, so the surface is recognizable and an
 *   ops route can never shadow an app route;
 * - injects the given auth middleware into every route, the manifest
 *   included, so an unauthenticated ops surface cannot be created by
 *   accident — there is no opt-out;
 * - serves `GET /_ops/_manifest`, the self-description the `spfn ops` CLI
 *   discovers commands from.
 *
 * The auth middleware itself lives with the app's auth stack (`@spfn/auth`
 * ships `opsTokenAuth`); core owns only the structure, so the ops surface has
 * no opinion about how a token is stored or verified.
 *
 * @example
 * ```ts
 * import { createOpsRouter } from '@spfn/core/ops';
 * import { opsTokenAuth, requireOpsScope } from '@spfn/auth/server';
 *
 * export const opsRouter = createOpsRouter({
 *     listSignups: route.get('/_ops/signups')
 *         .use([requireOpsScope('waitlist:read')])
 *         .handler(async () => signupsRepository.list()),
 * }, { auth: opsTokenAuth });
 *
 * // mounted like any package router:
 * export const appRouter = defineRouter({ ... }).packages([opsRouter]);
 * ```
 */

import type { NamedMiddleware } from '../route/define-middleware';
import { route, type RouteDef } from '../route/route-builder';
import { defineRouter, type Router } from '../route/router';
import { collectOpsCommands, OpsRouterError, type OpsManifest } from './manifest';

/** Every ops route lives under this prefix. */
export const OPS_PATH_PREFIX = '/_ops/';

/** Where the manifest is served. Reserved — an app route cannot claim it. */
export const OPS_MANIFEST_PATH = '/_ops/_manifest';

/** Reserved route name for the injected manifest route. */
const OPS_MANIFEST_NAME = 'getOpsManifest';

export interface OpsRouterOptions
{
    /**
     * The middleware that authenticates every ops request. Required — an ops
     * surface without authentication is refused at definition time, not
     * discovered in production.
     */
    auth: NamedMiddleware<string>;
}

function isRouter(value: unknown): value is Router<any>
{
    return value !== null
        && typeof value === 'object'
        && 'routes' in value
        && '_routes' in value;
}

function isRouteDef(value: unknown): value is RouteDef<any>
{
    return value !== null
        && typeof value === 'object'
        && 'handler' in value;
}

function assertOpsRoute(name: string, def: RouteDef<any>): void
{
    if (!def.method || !def.path)
    {
        throw new OpsRouterError(
            `Ops route "${name}" has no method or path. `
            + 'An ops command is invoked on the wire, so both are required.',
        );
    }

    if (!def.path.startsWith(OPS_PATH_PREFIX))
    {
        throw new OpsRouterError(
            `Ops route "${name}" is at "${def.path}", outside "${OPS_PATH_PREFIX}". `
            + 'Every ops route lives under the prefix so the surface stays recognizable '
            + 'and can never shadow an app route.',
        );
    }

    if (def.path === OPS_MANIFEST_PATH)
    {
        throw new OpsRouterError(
            `Ops route "${name}" claims "${OPS_MANIFEST_PATH}", which is reserved for the manifest.`,
        );
    }

    if (name === OPS_MANIFEST_NAME)
    {
        throw new OpsRouterError(
            `Ops route name "${OPS_MANIFEST_NAME}" is reserved for the manifest route.`,
        );
    }
}

/**
 * Validate every route and hand back a copy with the auth middleware
 * prepended. Route-level injection (rather than router-level `.use`) makes
 * the middleware's `skips` declaration effective, so `opsTokenAuth` can
 * auto-skip a server-level `auth` middleware exactly as `oneTimeTokenAuth`
 * does.
 */
function secureRoutes(
    routes: Record<string, RouteDef<any> | Router<any>>,
    auth: NamedMiddleware<string>,
): Record<string, RouteDef<any> | Router<any>>
{
    const secured: Record<string, RouteDef<any> | Router<any>> = {};

    for (const [name, entry] of Object.entries(routes))
    {
        if (isRouter(entry))
        {
            secured[name] = defineRouter(
                secureRoutes(entry.routes, auth) as Record<string, RouteDef<any>>,
            );
            continue;
        }

        if (!isRouteDef(entry))
        {
            throw new OpsRouterError(`Ops router entry "${name}" is neither a route nor a router.`);
        }

        assertOpsRoute(name, entry);
        secured[name] = {
            ...entry,
            middlewares: [auth, ...(entry.middlewares ?? [])],
        };
    }

    return secured;
}

/**
 * Build the app's ops surface from its ops routes.
 *
 * Returns an ordinary `Router` meant to be mounted with `.packages()`, so ops
 * routes stay out of the app's client types exactly like other package
 * routes.
 */
export function createOpsRouter<TRoutes extends Record<string, RouteDef<any, any, any> | Router<any>>>(
    routes: TRoutes,
    options: OpsRouterOptions,
): Router<any>
{
    if (!options?.auth)
    {
        throw new OpsRouterError(
            'createOpsRouter requires an auth middleware ({ auth: ... }). '
            + 'An ops surface reachable without authentication cannot be created.',
        );
    }

    const manifest: OpsManifest = {
        manifestVersion: 1,
        commands: collectOpsCommands(routes),
    };

    const secured = secureRoutes(routes, options.auth);

    const manifestRoute = route.get(OPS_MANIFEST_PATH)
        .use([options.auth])
        .handler(async () => manifest);

    return defineRouter({
        ...secured,
        [OPS_MANIFEST_NAME]: manifestRoute,
    } as Record<string, RouteDef<any>>);
}
