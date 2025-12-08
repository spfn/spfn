/**
 * Server Config Builder
 *
 * Provides a fluent API for building server configuration
 */

import type { MiddlewareHandler } from 'hono';
import type { ServerConfig } from './types';
import type { Router, NamedMiddleware } from '@spfn/core/route';
import type { JobRouter, BossConfig } from '../job';
import { serverLogger } from './logger';

// ============================================================================
// Types
// ============================================================================

type Lifecycle = NonNullable<ServerConfig['lifecycle']>;
type LifecycleKey = keyof Lifecycle;

// ============================================================================
// Helper Functions
// ============================================================================

function collectHooks<K extends LifecycleKey>(
    lifecycles: Lifecycle[],
    key: K
): NonNullable<Lifecycle[K]>[]
{
    return lifecycles
        .map(lc => lc[key])
        .filter((hook): hook is NonNullable<Lifecycle[K]> => hook !== undefined);
}

function createMergedHook<T extends (...args: any[]) => void | Promise<void>>(
    hooks: T[]
): T | undefined
{
    if (hooks.length === 0)
    {
        return undefined;
    }

    return (async (...args: Parameters<T>) =>
    {
        for (const hook of hooks)
        {
            await hook(...args);
        }
    }) as T;
}

export class ServerConfigBuilder
{
    private config: ServerConfig = {};
    private lifecycles: NonNullable<ServerConfig['lifecycle']>[] = [];

    /**
     * Set server port
     */
    port(port: number): this
    {
        this.config.port = port;
        return this;
    }

    /**
     * Set server hostname
     */
    host(host: string): this
    {
        this.config.host = host;
        return this;
    }

    /**
     * Set CORS configuration
     */
    cors(cors: ServerConfig['cors']): this
    {
        this.config.cors = cors;
        return this;
    }

    /**
     * Configure built-in middleware
     */
    middleware(middleware: ServerConfig['middleware']): this
    {
        this.config.middleware = middleware;
        return this;
    }

    /**
     * Add custom middleware
     */
    use(handlers: MiddlewareHandler[]): this
    {
        this.config.use = handlers;
        return this;
    }

    /**
     * Add named middlewares for route-level skip control
     */
    middlewares(middlewares: ServerConfig['middlewares']): this
    {
        this.config.middlewares = middlewares;
        return this;
    }

    /**
     * Register define-route based router
     *
     * Automatically applies:
     * - Global middlewares from router._globalMiddlewares (via .use())
     * - Package routers from router._packageRouters (via .packages())
     *
     * @example
     * ```typescript
     * const appRouter = defineRouter({
     *   getUser: route.get('/users/:id')...
     * })
     * .packages([authRouter, cmsAppRouter])
     * .use([authMiddleware]);
     *
     * export default defineServerConfig()
     *   .routes(appRouter)  // middlewares auto-applied
     *   .build();
     * ```
     */
    routes(router: Router<any>): this
    {
        this.config.routes = router;

        // Collect all global middlewares from router and package routers
        const allGlobalMiddlewares: NamedMiddleware[] = [];

        // Add main router's global middlewares
        if (router._globalMiddlewares?.length > 0)
        {
            allGlobalMiddlewares.push(...router._globalMiddlewares);
        }

        // Add package routers' global middlewares
        if (router._packageRouters?.length > 0)
        {
            for (const pkgRouter of router._packageRouters)
            {
                if (pkgRouter._globalMiddlewares?.length > 0)
                {
                    allGlobalMiddlewares.push(...pkgRouter._globalMiddlewares);
                }
            }
        }

        // Merge with existing middlewares
        if (allGlobalMiddlewares.length > 0)
        {
            this.config.middlewares = [
                ...(this.config.middlewares || []),
                ...allGlobalMiddlewares,
            ];
        }

        return this;
    }

    /**
     * Register background jobs router
     *
     * @example
     * ```typescript
     * import { job, defineJobRouter } from '@spfn/core/job';
     *
     * const sendEmail = job('send-email')
     *   .input(Type.Object({ to: Type.String() }))
     *   .handler(async (input) => { ... });
     *
     * const jobRouter = defineJobRouter({ sendEmail });
     *
     * export default defineServerConfig()
     *   .routes(appRouter)
     *   .jobs(jobRouter)
     *   .build();
     * ```
     */
    jobs(router: JobRouter<any>, config?: Omit<BossConfig, 'connectionString'>): this
    {
        this.config.jobs = router;
        if (config)
        {
            this.config.jobsConfig = config;
        }
        return this;
    }

    /**
     * Enable/disable debug mode
     */
    debug(enabled: boolean): this
    {
        this.config.debug = enabled;
        return this;
    }

    /**
     * Configure database settings
     */
    database(database: ServerConfig['database']): this
    {
        this.config.database = database;
        return this;
    }

    /**
     * Configure server timeout settings
     */
    timeout(timeout: ServerConfig['timeout']): this
    {
        this.config.timeout = timeout;
        return this;
    }

    /**
     * Configure graceful shutdown settings
     */
    shutdown(shutdown: ServerConfig['shutdown']): this
    {
        this.config.shutdown = shutdown;
        return this;
    }

    /**
     * Configure health check endpoint
     */
    healthCheck(healthCheck: ServerConfig['healthCheck']): this
    {
        this.config.healthCheck = healthCheck;
        return this;
    }

    /**
     * Configure infrastructure initialization
     */
    infrastructure(infrastructure: ServerConfig['infrastructure']): this
    {
        this.config.infrastructure = infrastructure;
        return this;
    }

    /**
     * Configure lifecycle hooks
     * Can be called multiple times - hooks will be executed in registration order
     */
    lifecycle(lifecycle: ServerConfig['lifecycle']): this
    {
        if (lifecycle)
        {
            this.lifecycles.push(lifecycle);
        }
        return this;
    }

    /**
     * Build and return the final configuration
     */
    build(): ServerConfig
    {
        if (this.lifecycles.length > 0)
        {
            serverLogger.info('Merging lifecycles', { count: this.lifecycles.length });
            this.config.lifecycle = this.mergeLifecycles();
        }

        return this.config;
    }

    private mergeLifecycles(): Lifecycle
    {
        return {
            beforeInfrastructure: createMergedHook(
                collectHooks(this.lifecycles, 'beforeInfrastructure')
            ),
            afterInfrastructure: createMergedHook(
                collectHooks(this.lifecycles, 'afterInfrastructure')
            ),
            beforeRoutes: createMergedHook(
                collectHooks(this.lifecycles, 'beforeRoutes')
            ),
            afterRoutes: createMergedHook(
                collectHooks(this.lifecycles, 'afterRoutes')
            ),
            afterStart: createMergedHook(
                collectHooks(this.lifecycles, 'afterStart')
            ),
            beforeShutdown: createMergedHook(
                collectHooks(this.lifecycles, 'beforeShutdown')
            ),
        };
    }
}

/**
 * Create a new server configuration builder
 *
 * @example
 * ```typescript
 * // server.config.ts
 * import { defineServerConfig, route, defineRouter } from '@spfn/core/server';
 * import { Type } from '@sinclair/typebox';
 *
 * const appRouter = defineRouter({
 *   getUser: route.get('/users/:id')
 *     .input(Type.Object({ id: Type.String() }))
 *     .handler(async (c) => {
 *       const { id } = await c.data();
 *       return c.success({ id, name: 'John' });
 *     }),
 * });
 *
 * export default defineServerConfig()
 *   .port(3000)
 *   .routes(appRouter)
 *   .middleware({ logger: true, cors: true })
 *   .debug(true)
 *   .build();
 * ```
 */
export function defineServerConfig(): ServerConfigBuilder
{
    return new ServerConfigBuilder();
}