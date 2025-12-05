/**
 * Router Definition
 *
 * Provides router composition and middleware management
 */

import type { NamedMiddleware } from './define-middleware';
import type { RouteDef } from './route-builder';

/**
 * Router definition - holds all routes
 */
export interface Router<TRoutes extends Record<string, RouteDef<any, any, any> | Router<any>>> {
    routes: TRoutes;
    _routes: TRoutes;
    _packageRouters: Router<any>[];
    _globalMiddlewares: NamedMiddleware<string>[];

    /**
     * Register package routers (type-hidden)
     *
     * Package routes are:
     * - Recognized by RPC proxy and backend
     * - NOT exposed in client types (use package's own API like authApi, cmsApi)
     *
     * @example
     * ```ts
     * import { authRouter } from '@spfn/auth/server';
     * import { cmsAppRouter } from '@spfn/cms/server';
     *
     * export const appRouter = defineRouter({
     *     getRoot,
     *     getHealth,
     * })
     * .packages([authRouter, cmsAppRouter]);
     *
     * // Client usage:
     * // api.getRoot.call({})     - app routes
     * // authApi.login.call({})   - package API
     * ```
     */
    packages(routers: Router<any>[]): Router<TRoutes>;

    /**
     * Register global middlewares
     *
     * Applied to all routes unless explicitly skipped via .skip()
     *
     * @example
     * ```ts
     * import { authMiddleware, loggingMiddleware } from './middlewares';
     *
     * export const appRouter = defineRouter({
     *     getRoot,
     *     getHealth,
     * })
     * .packages([authRouter])
     * .use([authMiddleware, loggingMiddleware]);
     * ```
     */
    use(middlewares: NamedMiddleware<string>[]): Router<TRoutes>;
}

/**
 * Create a Router instance with chainable methods
 */
function createRouterInstance<TRoutes extends Record<string, RouteDef<any, any, any> | Router<any>>>(
    routes: TRoutes,
    packageRouters: Router<any>[] = [],
    globalMiddlewares: NamedMiddleware<string>[] = []
): Router<TRoutes>
{
    return {
        routes,
        _routes: routes,
        _packageRouters: packageRouters,
        _globalMiddlewares: globalMiddlewares,

        packages(routers: Router<any>[]): Router<TRoutes>
        {
            const newPackageRouters = [...this._packageRouters, ...routers];

            // Also include nested package routers if any
            for (const pkgRouter of routers)
            {
                if (pkgRouter._packageRouters?.length > 0)
                {
                    newPackageRouters.push(...pkgRouter._packageRouters);
                }
            }

            return createRouterInstance(this.routes, newPackageRouters, this._globalMiddlewares);
        },

        use(middlewares: NamedMiddleware<string>[]): Router<TRoutes>
        {
            return createRouterInstance(this.routes, this._packageRouters, [...this._globalMiddlewares, ...middlewares]);
        },
    };
}

/**
 * Define a router with multiple routes (tRPC-style)
 *
 * Supports chainable API for packages and middlewares:
 *
 * @example
 * ```ts
 * // Basic usage
 * export const appRouter = defineRouter({
 *     getRoot,
 *     getHealth,
 *     listExamples,
 * });
 *
 * // With package routers (type-hidden)
 * export const appRouter = defineRouter({
 *     getRoot,
 *     getHealth,
 * })
 * .packages([authRouter, cmsAppRouter]);
 *
 * // With global middlewares
 * export const appRouter = defineRouter({
 *     getRoot,
 *     getHealth,
 * })
 * .packages([authRouter])
 * .use([authMiddleware, loggingMiddleware]);
 *
 * export type AppRouter = typeof appRouter;
 * ```
 *
 * Package routes:
 * - Recognized by RPC proxy and backend for routing
 * - NOT included in AppRouter type (use authApi, cmsApi instead)
 * - Prevents confusion between app API and package APIs
 */
export function defineRouter<TRoutes extends Record<string, RouteDef<any, any, any> | Router<any>>>(
    routes: TRoutes
): Router<TRoutes>
{
    return createRouterInstance(routes);
}