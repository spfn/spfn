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
     * Routes directory path (default: src/server/routes)
     */
    routesPath?: string;

    /**
     * Enable debug mode (default: NODE_ENV === 'development')
     */
    debug?: boolean;

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