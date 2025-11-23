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
     */
    lifecycle(lifecycle: ServerConfig['lifecycle']): this
    {
        this.config.lifecycle = lifecycle;
        return this;
    }

    /**
     * Build and return the final configuration
     */
    build(): ServerConfig
    {
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