/**
 * Route Registration for define-route style routing
 *
 * Registers routes defined with route.get()...handler() to Hono app
 */

import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { logger } from '@spfn/core/logger';
import type { NamedMiddleware } from './define-middleware';
import type { RouteInput } from './route-input';
import type { RouteBuilderContext } from './context';
import type { RouteDef } from './route-builder';
import type { Router } from './router';
import type { HttpMethod } from './types';
import {
    validateField,
    extractQueryParams,
    extractHeaders,
    extractCookies,
    parseJsonBody,
} from './validation';

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
    };

    // Collect all middlewares: server-level (filtered) + route-level
    const allMiddlewares: MiddlewareHandler[] = [];

    // Track registered middlewares for deduplication
    const registeredNames = new Set<string>();
    const registeredHandlers = new Set<MiddlewareHandler>();

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
                    registeredNames.add(middleware.name);
                    registeredHandlers.add(middleware.handler);
                }
                else
                {
                    logger.debug(`⏭️  Skipping middleware '${middleware.name}' for route: ${method} ${path}`, { name });
                }
            }
        }
    }

    // Add route-level middlewares (with deduplication by name or handler reference)
    for (const mw of middlewares)
    {
        if (isNamedMiddleware(mw))
        {
            // Named middleware: deduplicate by name
            if (registeredNames.has(mw.name))
            {
                logger.debug(`🔄 Skipping duplicate middleware '${mw.name}' for route: ${method} ${path}`, { name });
                continue;
            }
            registeredNames.add(mw.name);
            allMiddlewares.push(mw.handler);
        }
        else
        {
            // Regular middleware: deduplicate by handler reference
            if (registeredHandlers.has(mw))
            {
                logger.debug(`🔄 Skipping duplicate middleware handler for route: ${method} ${path}`, { name });
                continue;
            }
            registeredHandlers.add(mw);
            allMiddlewares.push(mw);
        }
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
    // Validate and extract all input fields
    const params = validateField(input.params, c.req.param(), 'path parameters');
    const query = validateField(input.query, extractQueryParams(c), 'query parameters');
    const headers = validateField(input.headers, extractHeaders(c), 'headers');
    const cookies = validateField(input.cookies, extractCookies(c), 'cookies');

    // Body requires async parsing
    let body: Record<string, unknown> = {};
    if (input.body)
    {
        const rawBody = await parseJsonBody(c);
        body = validateField(input.body, rawBody, 'request body');
    }

    // Create context with structured data()
    return {
        data: async () => ({
            params,
            query,
            body,
            headers,
            cookies,
        }),

        json: (data, status, resHeaders) =>
        {
            return c.json(data, status, resHeaders);
        },

        created: (data, location) =>
        {
            const resHeaders: Record<string, string> = {};
            if (location)
            {
                resHeaders['Location'] = location;
            }

            return c.json(data, 201 as ContentfulStatusCode, resHeaders);
        },

        accepted: (data) =>
        {
            if (data === undefined)
            {
                return c.body(null, 202 as ContentfulStatusCode);
            }

            return c.json(data, 202 as ContentfulStatusCode);
        },

        noContent: () =>
        {
            return c.body(null, 204 as ContentfulStatusCode);
        },

        notModified: () =>
        {
            return c.body(null, 304 as ContentfulStatusCode);
        },

        paginated: (data, page, limit, total) =>
        {
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