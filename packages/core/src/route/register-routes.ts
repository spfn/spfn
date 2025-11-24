/**
 * Route Registration for define-route style routing
 *
 * Registers routes defined with route.get()...handler() to Hono app
 */

import { Value } from '@sinclair/typebox/value';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ValidationError } from '@spfn/core/errors';
import { logger } from '@spfn/core/logger';
import type { NamedMiddleware } from './define-middleware';
import type { HttpMethod, RouteBuilderContext, RouteDef, RouteInput, Router, } from './define-route';

/**
 * Type guard to check if value is a Router
 */
function isRouter(value: unknown): value is Router<any>
{
    return value !== null &&
        typeof value === 'object' &&
        'routes' in value &&
        '_routes' in value;
}

/**
 * Type guard to check if value is a RouteDef
 */
function isRouteDef(value: unknown): value is RouteDef<any>
{
    return value !== null &&
        typeof value === 'object' &&
        'handler' in value;
}

/**
 * Type guard to check if value is a NamedMiddleware
 */
function isNamedMiddleware(value: unknown): value is NamedMiddleware<any>
{
    return value !== null &&
        typeof value === 'object' &&
        'name' in value &&
        'handler' in value &&
        '_name' in value;
}

/**
 * Register routes from defineRouter() to Hono app
 *
 * @param app - Hono app instance
 * @param router - Router definition
 * @param namedMiddlewares - Optional server-level named middlewares
 *
 * @example
 * ```ts
 * const appRouter = defineRouter({
 *   getUser: route.get('/users/:id')...
 *   createUser: route.post('/users')...
 * });
 *
 * const app = new Hono();
 * const namedMiddlewares = [
 *   { name: 'auth', handler: AuthMiddleware() },
 *   { name: 'rateLimit', handler: RateLimitMiddleware() },
 * ];
 * registerRoutes(app, appRouter, namedMiddlewares);
 * ```
 */
export function registerRoutes<TRoutes extends Record<string, RouteDef<any> | Router<any>>>(
    app: Hono,
    router: Router<TRoutes>,
    namedMiddlewares?: ReadonlyArray<{ name: string; handler: MiddlewareHandler }>
): void
{
    for (const [name, routeOrRouter] of Object.entries(router.routes))
    {
        if (isRouter(routeOrRouter))
        {
            // Nested router - recursively register
            registerRoutes(app, routeOrRouter, namedMiddlewares);
        }
        else if (isRouteDef(routeOrRouter))
        {
            // Single route - register
            registerRoute(app, name, routeOrRouter, namedMiddlewares);
        }
        else
        {
            logger.warn(`Unknown route type for "${name}" - skipping`, {
                type: typeof routeOrRouter,
            });
        }
    }
}

/**
 * Register a single route
 */
function registerRoute(
    app: Hono,
    name: string,
    routeDef: RouteDef<any>,
    namedMiddlewares?: ReadonlyArray<{ name: string; handler: MiddlewareHandler }>
): void
{
    const { method, path, input, middlewares = [], skipMiddlewares, handler } = routeDef;

    if (!method || !path)
    {
        logger.warn(`Route "${name}" is missing method or path - skipping`, {
            method,
            path,
        });

        return;
    }

    // Create wrapped handler with validation
    const wrappedHandler = async (c: Context) =>
    {
        try
        {
            // Create RouteBuilderContext with validation
            const context = await createRouteBuilderContext(c, input || {});

            // Call user handler
            const result = await handler(context);

            // If handler returns Response, use it directly
            if (result instanceof Response)
            {
                return result;
            }

            // Otherwise, return data as JSON directly (no wrapper)
            return c.json(result);
        }
        catch (error)
        {
            // Re-throw to let error handler catch it
            throw error;
        }
    };

    // Collect all middlewares: server-level (filtered) + route-level
    const allMiddlewares: MiddlewareHandler[] = [];

    // Track global middleware handlers to prevent duplicates
    const globalHandlers = new Set<MiddlewareHandler>();

    // Check if skipping all middlewares
    const skipAll = skipMiddlewares === '*';

    // Add server-level named middlewares (skip those in skipMiddlewares or if '*')
    if (namedMiddlewares && namedMiddlewares.length > 0)
    {
        if (skipAll)
        {
            logger.debug(`⏭️  Skipping all middlewares (*) for route: ${method} ${path}`, { name });
        }
        else
        {
            const skipSet = new Set(Array.isArray(skipMiddlewares) ? skipMiddlewares : []);
            for (const middleware of namedMiddlewares)
            {
                if (!skipSet.has(middleware.name))
                {
                    allMiddlewares.push(middleware.handler);
                    globalHandlers.add(middleware.handler);
                }
                else
                {
                    logger.debug(`⏭️  Skipping middleware '${middleware.name}' for route: ${method} ${path}`, { name });
                }
            }
        }
    }

    // Add route-level middlewares (with deduplication)
    for (const mw of middlewares)
    {
        // Extract handler from NamedMiddleware or use directly
        const handler = isNamedMiddleware(mw) ? mw.handler : mw;

        // Check if already added from global middlewares
        if (globalHandlers.has(handler))
        {
            const middlewareName = isNamedMiddleware(mw) ? mw.name : 'unknown';
            logger.debug(`🔄 Skipping duplicate middleware '${middlewareName}' for route: ${method} ${path}`, { name });
            continue;
        }

        allMiddlewares.push(handler);
    }

    // Register to Hono with correct HTTP method
    const methodLower = method.toLowerCase() as Lowercase<HttpMethod>;

    if (allMiddlewares.length > 0)
    {
        // Register with middlewares
        app[methodLower](path, ...allMiddlewares, wrappedHandler);
    }
    else
    {
        // Register without middlewares
        app[methodLower](path, wrappedHandler);
    }

    logger.debug(`Registered route: ${method} ${path}`, { name });
}

/**
 * Create RouteBuilderContext from Hono Context
 *
 * Validates params, query, body, headers, cookies and returns structured input
 */
async function createRouteBuilderContext<TInput extends RouteInput>(
    c: Context,
    input: TInput
): Promise<RouteBuilderContext<TInput>>
{
    // Validate and extract params
    let params: Record<string, any> = {};
    if (input.params)
    {
        params = c.req.param();
        params = Value.Convert(input.params, params) as typeof params;

        const errors = [...Value.Errors(input.params, params)];
        if (errors.length > 0)
        {
            throw new ValidationError({
                message: 'Invalid path parameters',
                fields: errors.map(e => ({
                    path: e.path,
                    message: e.message,
                    value: e.value,
                })),
            });
        }
    }

    // Validate and extract query
    let query: Record<string, any> = {};
    if (input.query)
    {
        const url = new URL(c.req.url);
        const queryObj: Record<string, string | string[]> = {};

        url.searchParams.forEach((v, k) =>
        {
            const existing = queryObj[k];
            if (existing)
            {
                queryObj[k] = Array.isArray(existing) ? [...existing, v] : [existing, v];
            }
            else
            {
                queryObj[k] = v;
            }
        });

        query = Value.Convert(input.query, queryObj) as typeof query;

        const errors = [...Value.Errors(input.query, query)];
        if (errors.length > 0)
        {
            throw new ValidationError({
                message: 'Invalid query parameters',
                fields: errors.map(e => ({
                    path: e.path,
                    message: e.message,
                    value: e.value,
                })),
            });
        }
    }

    // Validate and extract body
    let body: Record<string, any> = {};
    if (input.body)
    {
        try
        {
            body = await c.req.json();
        }
        catch (error)
        {
            throw new ValidationError({
                message: 'Invalid JSON body',
                fields: [{
                    path: '/',
                    message: 'Failed to parse JSON',
                    value: error instanceof Error ? error.message : 'Unknown error',
                }],
            });
        }

        body = Value.Convert(input.body, body) as typeof body;

        const errors = [...Value.Errors(input.body, body)];
        if (errors.length > 0)
        {
            throw new ValidationError({
                message: 'Invalid request body',
                fields: errors.map(e => ({
                    path: e.path,
                    message: e.message,
                    value: e.value,
                })),
            });
        }
    }

    // Validate and extract headers
    let headers: Record<string, any> = {};
    if (input.headers)
    {
        const rawHeaders: Record<string, string> = {};
        c.req.raw.headers.forEach((value, key) =>
        {
            rawHeaders[key.toLowerCase()] = value;
        });

        headers = Value.Convert(input.headers, rawHeaders) as typeof headers;

        const errors = [...Value.Errors(input.headers, headers)];
        if (errors.length > 0)
        {
            throw new ValidationError({
                message: 'Invalid headers',
                fields: errors.map(e => ({
                    path: e.path,
                    message: e.message,
                    value: e.value,
                })),
            });
        }
    }

    // Validate and extract cookies
    let cookies: Record<string, any> = {};
    if (input.cookies)
    {
        // Hono doesn't have built-in cookie parsing, parse manually
        const cookieHeader = c.req.header('cookie');
        const rawCookies: Record<string, string> = {};

        if (cookieHeader)
        {
            cookieHeader.split(';').forEach(cookie =>
            {
                const [key, value] = cookie.trim().split('=');
                if (key && value)
                {
                    rawCookies[key] = decodeURIComponent(value);
                }
            });
        }

        cookies = Value.Convert(input.cookies, rawCookies) as typeof cookies;

        const errors = [...Value.Errors(input.cookies, cookies)];
        if (errors.length > 0)
        {
            throw new ValidationError({
                message: 'Invalid cookies',
                fields: errors.map(e => ({
                    path: e.path,
                    message: e.message,
                    value: e.value,
                })),
            });
        }
    }

    // Create context with structured data()
    return {
        // Return structured input
        data: async () => ({
            params,
            query,
            body,
            headers,
            cookies,
        }),

        json: (data, status, headers) => {
            return c.json(data, status, headers);
        },

        created: (data, location) => {
            // Return data directly with 201 status + Location header
            const headers: Record<string, string> = {};
            if (location) {
                headers['Location'] = location;
            }

            return c.json(data, 201 as ContentfulStatusCode, headers);
        },

        accepted: (data) => {
            if (data === undefined) {
                return c.body(null, 202 as ContentfulStatusCode);
            }

            // Return data directly with 202 status
            return c.json(data, 202 as ContentfulStatusCode);
        },

        noContent: () => {
            return c.body(null, 204 as ContentfulStatusCode);
        },

        notModified: () => {
            return c.body(null, 304 as ContentfulStatusCode);
        },

        paginated: (data, page, limit, total) => {
            // Return data with pagination metadata directly (no wrapper)
            return c.json({
                items: data,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            }, 200 as ContentfulStatusCode);
        },

        raw: c,
    };
}