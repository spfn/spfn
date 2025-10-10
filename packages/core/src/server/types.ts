import type { Hono, MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';

/**
 * CORS configuration options - inferred from hono/cors
 */
type CorsConfig = Parameters<typeof cors>[0];

/**
 * Server Configuration Options
 *
 * Level 2: Partial customization with server.config.ts
 */
export interface ServerConfig
{
    /**
     * Server port (default: 4000)
     */
    port?: number;

    /**
     * Server hostname (default: 'localhost')
     */
    host?: string;

    /**
     * CORS configuration
     * Set to false to disable default CORS middleware
     */
    cors?: CorsConfig | false;

    /**
     * Enable/disable built-in middleware
     */
    middleware?:
    {
        /**
         * Request logger (default: true)
         */
        logger?: boolean;

        /**
         * CORS (default: true)
         */
        cors?: boolean;

        /**
         * Error handler (default: true)
         */
        errorHandler?: boolean;
    };

    /**
     * Additional custom middleware
     */
    use?: MiddlewareHandler[];

    /**
     * Global middlewares with names for route-level skip control
     * Each middleware can be skipped per route using meta.skipMiddlewares
     *
     * @example
     * ```typescript
     * import { authMiddleware } from '@spfn/auth';
     *
     * export default {
     *   middlewares: [
     *     { name: 'auth', handler: authMiddleware() },
     *     { name: 'rateLimit', handler: rateLimitMiddleware() },
     *   ]
     * } satisfies ServerConfig;
     * ```
     */
    middlewares?: Array<{
        name: string;
        handler: MiddlewareHandler;
    }>;

    /**
     * Routes directory path (default: src/server/routes)
     */
    routesPath?: string;

    /**
     * Enable debug mode (default: NODE_ENV === 'development')
     */
    debug?: boolean;

    /**
     * Database configuration
     */
    database?: {
        /**
         * Connection pool configuration
         * Overrides environment variables and defaults
         */
        pool?: {
            /**
             * Maximum number of connections in pool
             * @default Production: 20, Development: 10
             * @env DB_POOL_MAX
             */
            max?: number;

            /**
             * Idle connection timeout in seconds
             * @default Production: 30, Development: 20
             * @env DB_POOL_IDLE_TIMEOUT
             */
            idleTimeout?: number;
        };

        /**
         * Health check configuration
         * Periodic checks to ensure database connection is alive
         */
        healthCheck?: {
            /**
             * Enable/disable health checks
             * @default true
             * @env DB_HEALTH_CHECK_ENABLED
             */
            enabled?: boolean;

            /**
             * Health check interval in milliseconds
             * @default 60000 (60 seconds)
             * @env DB_HEALTH_CHECK_INTERVAL
             */
            interval?: number;

            /**
             * Enable automatic reconnection on failure
             * @default true
             * @env DB_HEALTH_CHECK_RECONNECT
             */
            reconnect?: boolean;

            /**
             * Maximum reconnection attempts
             * @default 3
             * @env DB_HEALTH_CHECK_MAX_RETRIES
             */
            maxRetries?: number;

            /**
             * Delay between reconnection attempts in milliseconds
             * @default 5000 (5 seconds)
             * @env DB_HEALTH_CHECK_RETRY_INTERVAL
             */
            retryInterval?: number;
        };
    };

    /**
     * Hook: Run before routes are loaded
     */
    beforeRoutes?: (app: Hono) => void | Promise<void>;

    /**
     * Hook: Run after routes are loaded
     */
    afterRoutes?: (app: Hono) => void | Promise<void>;
}

/**
 * App Factory Function
 *
 * Level 3: Full control with app.ts
 */
export type AppFactory = () => Promise<Hono> | Hono;