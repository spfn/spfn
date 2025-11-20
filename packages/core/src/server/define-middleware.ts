/**
 * Middleware Definition Helper
 *
 * Provides type-safe middleware definition with name inference
 */

import type { MiddlewareHandler } from 'hono';

/**
 * Named middleware with type inference
 *
 * @example
 * ```ts
 * export const authMiddleware = defineMiddleware('auth', async (c, next) => {
 *   // auth logic
 *   c.set('user', { id: 1 });
 *   await next();
 * });
 *
 * export const rateLimitMiddleware = defineMiddleware('rateLimit', async (c, next) => {
 *   // rate limit logic
 *   await next();
 * });
 * ```
 */
export type NamedMiddleware<TName extends string = string> = {
    name: TName;
    handler: MiddlewareHandler;
    _name: TName;  // Type inference helper
};

/**
 * Define a named middleware
 *
 * Creates a middleware with a unique name that can be referenced
 * in route-level skip() calls with full type safety.
 *
 * @param name - Unique middleware name
 * @param handler - Middleware handler function
 * @returns Named middleware with type inference
 *
 * @example
 * ```ts
 * // middlewares.ts
 * import { defineMiddleware } from '@spfn/core/server';
 *
 * export const authMiddleware = defineMiddleware('auth', async (c, next) => {
 *   const token = c.req.header('authorization');
 *   if (!token) {
 *     return c.json({ error: 'Unauthorized' }, 401);
 *   }
 *   c.set('user', await verifyToken(token));
 *   await next();
 * });
 *
 * export const rateLimitMiddleware = defineMiddleware('rateLimit', async (c, next) => {
 *   const ip = c.req.header('x-forwarded-for') ?? 'unknown';
 *   if (await isRateLimited(ip)) {
 *     return c.json({ error: 'Too many requests' }, 429);
 *   }
 *   await next();
 * });
 *
 * // server.config.ts
 * export default defineServerConfig()
 *   .middlewares([authMiddleware, rateLimitMiddleware])
 *   .routes(appRouter)
 *   .build();
 *
 * // routes.ts
 * export const publicRoute = route.get('/health')
 *   .skip(['auth', 'rateLimit'])  // ✅ Type-safe! Autocomplete!
 *   .handler(async (c) => c.success({ status: 'ok' }));
 *
 * export const publicData = route.get('/public-data')
 *   .skip(['auth'])  // ✅ Skip only auth, keep rateLimit
 *   .handler(async (c) => { ... });
 *
 * export const protectedRoute = route.get('/users')
 *   // No skip - all middlewares applied
 *   .handler(async (c) => { ... });
 * ```
 */
export function defineMiddleware<TName extends string>(
    name: TName,
    handler: MiddlewareHandler
): NamedMiddleware<TName>
{
    return {
        name,
        handler,
        _name: name as TName,
    };
}

/**
 * Extract middleware names from an array of named middlewares
 *
 * @example
 * ```ts
 * type Middlewares = [
 *   NamedMiddleware<'auth'>,
 *   NamedMiddleware<'rateLimit'>
 * ];
 * type Names = ExtractMiddlewareNames<Middlewares>;  // 'auth' | 'rateLimit'
 * ```
 */
export type ExtractMiddlewareNames<T extends readonly NamedMiddleware<any>[]> =
    T[number]['_name'];