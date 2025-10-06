import type { Context, MiddlewareHandler } from 'hono';

/**
 * Conditional Middleware Wrapper
 *
 * Wraps a middleware to allow route-level skip control via contract.meta.skipMiddlewares
 *
 * ## How it works:
 * 1. bind() stores contract.meta in context
 * 2. conditionalMiddleware checks if this middleware should be skipped
 * 3. If skipped, calls next() immediately; otherwise runs the middleware
 *
 * ## Usage:
 * ```typescript
 * // In auto-loader
 * app.use(urlPath + '/*', conditionalMiddleware('auth', authMiddleware()));
 *
 * // In route contract
 * const contract = {
 *   response: Type.Object({...}),
 *   meta: { skipMiddlewares: ['auth'] }
 * };
 * ```
 *
 * @param name - Middleware name (must match server.config.ts middlewares array)
 * @param handler - The actual middleware handler
 * @returns Wrapped middleware that checks skip conditions at runtime
 */
export function conditionalMiddleware(
    name: string,
    handler: MiddlewareHandler
): MiddlewareHandler
{
    return async (c: Context, next) =>
    {
        // Fast path: no meta = run middleware immediately
        const meta = c.get('routeMeta');
        if (!meta?.skipMiddlewares)
        {
            return handler(c, next);
        }

        // Check if this middleware should be skipped
        if (meta.skipMiddlewares.includes(name))
        {
            return next();
        }

        // Run the middleware
        return handler(c, next);
    };
}