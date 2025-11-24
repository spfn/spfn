/**
 * Server Config Builder
 *
 * Provides a fluent API for building server configuration
 */

import type { MiddlewareHandler } from 'hono';
import type { ServerConfig } from './types';
import type { Router } from '../route';

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
     * @example
     * ```typescript
     * const appRouter = defineRouter({
     *   getUser: route.get('/users/:id')...
     * });
     *
     * export default defineServerConfig()
     *   .routes(appRouter)
     *   .build();
     * ```
     */
    routes(router: Router<any>): this
    {
        this.config.routes = router;
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
        // Merge all lifecycle hooks if any were registered
        if (this.lifecycles.length > 0)
        {
            console.log(`[ServerConfigBuilder] Merging ${this.lifecycles.length} lifecycle(s)`);
            const mergedLifecycle: ServerConfig['lifecycle'] = {};

            // Collect all beforeInfrastructure hooks
            const beforeInfraHooks = this.lifecycles
                .map(lc => lc.beforeInfrastructure)
                .filter((hook): hook is NonNullable<typeof hook> => hook !== undefined);

            if (beforeInfraHooks.length > 0)
            {
                mergedLifecycle.beforeInfrastructure = async (config) =>
                {
                    for (const hook of beforeInfraHooks)
                    {
                        await hook(config);
                    }
                };
            }

            // Collect all afterInfrastructure hooks
            const afterInfraHooks = this.lifecycles
                .map(lc => lc.afterInfrastructure)
                .filter((hook): hook is NonNullable<typeof hook> => hook !== undefined);

            if (afterInfraHooks.length > 0)
            {
                mergedLifecycle.afterInfrastructure = async () =>
                {
                    for (const hook of afterInfraHooks)
                    {
                        await hook();
                    }
                };
            }

            // Collect all beforeRoutes hooks
            const beforeRoutesHooks = this.lifecycles
                .map(lc => lc.beforeRoutes)
                .filter((hook): hook is NonNullable<typeof hook> => hook !== undefined);

            if (beforeRoutesHooks.length > 0)
            {
                mergedLifecycle.beforeRoutes = async (app) =>
                {
                    for (const hook of beforeRoutesHooks)
                    {
                        await hook(app);
                    }
                };
            }

            // Collect all afterRoutes hooks
            const afterRoutesHooks = this.lifecycles
                .map(lc => lc.afterRoutes)
                .filter((hook): hook is NonNullable<typeof hook> => hook !== undefined);

            if (afterRoutesHooks.length > 0)
            {
                mergedLifecycle.afterRoutes = async (app) =>
                {
                    for (const hook of afterRoutesHooks)
                    {
                        await hook(app);
                    }
                };
            }

            // Collect all afterStart hooks
            const afterStartHooks = this.lifecycles
                .map(lc => lc.afterStart)
                .filter((hook): hook is NonNullable<typeof hook> => hook !== undefined);

            if (afterStartHooks.length > 0)
            {
                mergedLifecycle.afterStart = async (instance) =>
                {
                    for (const hook of afterStartHooks)
                    {
                        await hook(instance);
                    }
                };
            }

            // Collect all beforeShutdown hooks
            const beforeShutdownHooks = this.lifecycles
                .map(lc => lc.beforeShutdown)
                .filter((hook): hook is NonNullable<typeof hook> => hook !== undefined);

            if (beforeShutdownHooks.length > 0)
            {
                mergedLifecycle.beforeShutdown = async () =>
                {
                    for (const hook of beforeShutdownHooks)
                    {
                        await hook();
                    }
                };
            }

            this.config.lifecycle = mergedLifecycle;
        }

        return this.config;
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