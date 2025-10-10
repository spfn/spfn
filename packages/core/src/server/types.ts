import type { Hono, MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import type { serve } from '@hono/node-server';

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

        /**
         * Query performance monitoring configuration
         * Tracks slow queries and logs performance metrics
         */
        monitoring?: {
            /**
             * Enable/disable query performance monitoring
             * @default true in development, false in production
             * @env DB_MONITORING_ENABLED
             */
            enabled?: boolean;

            /**
             * Slow query threshold in milliseconds
             * Queries exceeding this duration will be logged as warnings
             * @default 1000 (1 second)
             * @env DB_MONITORING_SLOW_THRESHOLD
             */
            slowThreshold?: number;

            /**
             * Log actual SQL queries in performance logs
             * ⚠️ Warning: May expose sensitive data in logs
             * @default false
             * @env DB_MONITORING_LOG_QUERIES
             */
            logQueries?: boolean;
        };
    };

    /**
     * Server timeout configuration
     * Controls HTTP server timeout behavior for security and resource management
     */
    timeout?: {
        /**
         * Request timeout in milliseconds
         * Time limit for entire request/response cycle
         * Set to 0 to disable (not recommended in production)
         * @default 120000 (2 minutes)
         * @env SERVER_TIMEOUT
         */
        request?: number;

        /**
         * Keep-alive timeout in milliseconds
         * How long to keep idle HTTP connections open for reuse
         * Should be slightly longer than load balancer timeout (typically 60s)
         * @default 65000 (65 seconds)
         * @env SERVER_KEEPALIVE_TIMEOUT
         */
        keepAlive?: number;

        /**
         * Headers timeout in milliseconds
         * Time limit for receiving complete HTTP request headers
         * Protects against Slowloris attacks
         * @default 60000 (60 seconds)
         * @env SERVER_HEADERS_TIMEOUT
         */
        headers?: number;
    };

    /**
     * Graceful shutdown configuration
     * Controls server shutdown behavior during SIGTERM/SIGINT signals
     */
    shutdown?: {
        /**
         * Graceful shutdown timeout in milliseconds
         * Maximum time to wait for ongoing requests and resource cleanup
         * After timeout, forces process termination
         * @default 30000 (30 seconds)
         * @env SHUTDOWN_TIMEOUT
         */
        timeout?: number;
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

/**
 * Server Instance
 *
 * Returned by startServer() to provide access to server internals
 * Allows programmatic control over the server lifecycle
 */
export interface ServerInstance
{
    /**
     * Underlying Node.js HTTP server
     * Provides low-level access to the HTTP server instance
     */
    server: ReturnType<typeof serve>;

    /**
     * Hono app instance
     * Allows runtime route registration and middleware management
     */
    app: Hono;

    /**
     * Final server configuration used
     * Contains resolved values from all sources (runtime > file > env > defaults)
     */
    config: ServerConfig;

    /**
     * Manually close the server
     * Performs graceful shutdown: stops accepting connections, closes DB/Redis, exits process
     *
     * @example
     * ```typescript
     * const instance = await startServer({ port: 3000 });
     *
     * // Later...
     * await instance.close(); // Clean shutdown
     * ```
     */
    close: () => Promise<void>;
}