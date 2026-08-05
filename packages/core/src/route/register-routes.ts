/**
 * Route Registration for define-route style routing
 *
 * Registers routes defined with route.get()...handler() to Hono app
 */

import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode, RedirectStatusCode } from 'hono/utils/http-status';
import { logger } from '@spfn/core/logger';
import type { NamedMiddleware } from './define-middleware';
import type { RouteInput } from './route-input';
import type { RouteBuilderContext } from './context';
import type { RouteDef } from './route-builder';
import type { Router } from './router';
import type { HttpMethod } from './types';
import {
    validateField,
    validateFormData,
    extractQueryParams,
    extractHeaders,
    extractCookies,
    parseJsonBody,
    parseFormData,
} from './validation';

/**
 * Registered route information for logging
 */
export interface RegisteredRoute
{
    method: HttpMethod;
    path: string;
    name: string;
}

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
 * @param collectedRoutes
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
    namedMiddlewares?: ReadonlyArray<{ name: string; handler: MiddlewareHandler }>,
    collectedRoutes?: RegisteredRoute[],
): RegisteredRoute[]
{
    // Use provided array or create new one (top-level call)
    const routes = collectedRoutes ?? [];

    // Merge router's global middlewares with provided named middlewares
    const allNamedMiddlewares = [
        ...(namedMiddlewares ?? []),
        ...router._globalMiddlewares.map(mw => ({ name: mw.name, handler: mw.handler })),
    ];

    // 1. Register routes from router.routes
    for (const [name, routeOrRouter] of Object.entries(router.routes))
    {
        if (isRouter(routeOrRouter))
        {
            // Nested router - recursively register
            registerRoutes(app, routeOrRouter, allNamedMiddlewares, routes);
        }
        else if (isRouteDef(routeOrRouter))
        {
            // Single route - register
            const registered = registerRoute(app, name, routeOrRouter, allNamedMiddlewares);
            if (registered)
            {
                routes.push(registered);
            }
        }
        else
        {
            logger.warn(`Unknown route type for "${name}" - skipping`, {
                type: typeof routeOrRouter,
            });
        }
    }

    // 2. Register routes from package routers (_packageRouters)
    if (router._packageRouters && router._packageRouters.length > 0)
    {
        for (const pkgRouter of router._packageRouters)
        {
            registerRoutes(app, pkgRouter, allNamedMiddlewares, routes);
        }
    }

    return routes;
}

/**
 * Register a single route
 */
function registerRoute(
    app: Hono,
    name: string,
    routeDef: RouteDef<any>,
    namedMiddlewares?: ReadonlyArray<{ name: string; handler: MiddlewareHandler }>,
): RegisteredRoute | null
{
    const { method, path, input, middlewares = [], skipMiddlewares, handler } = routeDef;

    if (!method || !path)
    {
        logger.warn(`Route "${name}" is missing method or path - skipping`, {
            method,
            path,
        });

        return null;
    }

    // Create wrapped handler with validation
    const wrappedHandler = async (c: Context) =>
    {
        // Create RouteBuilderContext with validation
        const { context, responseMeta } = await createRouteBuilderContext(c, input || {});

        // Call user handler
        const result = await handler(context);

        // If handler returns Response, use it directly (e.g., c.json(), c.redirect())
        if (result instanceof Response)
        {
            return result;
        }

        // Handle empty responses (noContent, notModified, accepted without data)
        if (responseMeta.isEmpty)
        {
            return c.body(null, responseMeta.status);
        }

        // Return data as JSON with status and headers from helper methods
        const hasCustomHeaders = Object.keys(responseMeta.headers).length > 0;

        if (hasCustomHeaders)
        {
            return c.json(result, responseMeta.status, responseMeta.headers);
        }

        return c.json(result, responseMeta.status);
    };

    // Collect all middlewares: server-level (filtered) + route-level
    const allMiddlewares: MiddlewareHandler[] = [];

    // Track registered middlewares for deduplication
    const registeredNames = new Set<string>();
    const registeredHandlers = new Set<MiddlewareHandler>();

    // Check if skipping all middlewares
    const skipAll = skipMiddlewares === '*';

    // Collect auto-skips from route-level middlewares (e.g., optionalAuth skips 'auth')
    const autoSkips = new Set<string>();
    for (const mw of middlewares)
    {
        if (isNamedMiddleware(mw) && mw.skips)
        {
            for (const skipName of mw.skips)
            {
                autoSkips.add(skipName);
            }
        }
    }

    // Add server-level named middlewares (skip those in skipMiddlewares, autoSkips, or if '*')
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
                if (skipSet.has(middleware.name))
                {
                    logger.debug(`⏭️  Skipping middleware '${middleware.name}' for route: ${method} ${path}`, { name });
                }
                else if (autoSkips.has(middleware.name))
                {
                    logger.debug(`⏭️  Auto-skipping middleware '${middleware.name}' for route: ${method} ${path}`, { name });
                }
                else if (middleware.name && registeredNames.has(middleware.name))
                {
                    // A named middleware runs at most once per route. Two entries under
                    // one name are the same middleware reached by two paths (server
                    // config and router-level .use), and running it twice breaks any
                    // middleware holding one-shot state. An entry with no name is never
                    // collapsed — unrelated anonymous handlers share the empty name.
                    logger.debug(`🔄 Skipping duplicate middleware '${middleware.name}' for route: ${method} ${path}`, { name });
                }
                else
                {
                    allMiddlewares.push(middleware.handler);
                    registeredNames.add(middleware.name);
                    registeredHandlers.add(middleware.handler);
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

    // hono 4.12+ overload resolution fails with spread middleware arrays
    const handlers: MiddlewareHandler[] = [...allMiddlewares, wrappedHandler as unknown as MiddlewareHandler];
    app.on([methodLower], [path], ...handlers);

    logger.debug(`Registered route: ${method} ${path}`, { name });

    return { method, path, name };
}

/**
 * Response metadata set by helper methods
 */
interface ResponseMeta
{
    status: ContentfulStatusCode;
    headers: Record<string, string>;
    isEmpty: boolean;
}

/**
 * Create RouteBuilderContext from Hono Context
 *
 * Validates params, query, body, headers, cookies and returns structured input.
 * Helper methods (created, accepted, etc.) return data directly for type inference,
 * while storing response metadata internally for later use.
 */
async function createRouteBuilderContext<TInput extends RouteInput>(
    c: Context,
    input: TInput,
): Promise<{ context: RouteBuilderContext<TInput>; responseMeta: ResponseMeta }>
{
    // Validate and extract all input fields
    const params = validateField(input.params, c.req.param(), 'path parameters');
    const query = validateField(input.query, extractQueryParams(c), 'query parameters');
    const headers = validateField(input.headers, extractHeaders(c), 'headers');
    const cookies = validateField(input.cookies, extractCookies(c), 'cookies');

    // Body/FormData requires async parsing - determine by Content-Type
    let body: Record<string, unknown> = {};
    let formData: Record<string, unknown> = {};

    if (input.body || input.formData)
    {
        const contentType = c.req.header('content-type') || '';

        if (contentType.includes('multipart/form-data') && input.formData)
        {
            const rawFormData = await parseFormData(c);
            formData = validateFormData(input.formData, rawFormData, 'form data');
        }
        else if (input.body)
        {
            const rawBody = await parseJsonBody(c);
            body = validateField(input.body, rawBody, 'request body');
        }
    }

    // Cache for data() - avoid creating new object on each call
    let cachedData: any = null;

    // Response metadata - set by helper methods, used when building final Response
    const responseMeta: ResponseMeta = {
        status: 200 as ContentfulStatusCode,
        headers: {},
        isEmpty: false,
    };

    // Create context with structured data()
    const context: RouteBuilderContext<TInput> = {
        data: async () =>
        {
            if (!cachedData)
            {
                cachedData = { params, query, body, formData, headers, cookies };
            }

            return cachedData;
        },

        json: (data, status, resHeaders) =>
        {
            return c.json(data, status, resHeaders);
        },

        created: <T>(data: T, location?: string): T =>
        {
            responseMeta.status = 201 as ContentfulStatusCode;
            if (location)
            {
                responseMeta.headers['Location'] = location;
            }

            return data;
        },

        accepted: <T>(data?: T): any =>
        {
            responseMeta.status = 202 as ContentfulStatusCode;
            if (data === undefined)
            {
                responseMeta.isEmpty = true;

                return undefined;
            }

            return data;
        },

        noContent: (): void =>
        {
            responseMeta.status = 204 as ContentfulStatusCode;
            responseMeta.isEmpty = true;
        },

        notModified: (): void =>
        {
            responseMeta.status = 304 as ContentfulStatusCode;
            responseMeta.isEmpty = true;
        },

        paginated: <T>(data: T[], page: number, limit: number, total: number) =>
        {
            return {
                items: data,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            };
        },

        redirect: (url, status) =>
        {
            return c.redirect(url, status as RedirectStatusCode);
        },

        raw: c,
    };

    return { context, responseMeta };
}
