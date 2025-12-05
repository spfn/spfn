/**
 * RPC-Style Proxy for define-route System
 *
 * Next.js API Route handler that resolves routeName to method/path
 * and forwards requests to SPFN backend.
 *
 * @example
 * ```typescript
 * // app/api/rpc/[routeName]/route.ts
 * import { appRouter } from '@/server/router';
 * import { createRpcProxy } from '@spfn/core/nextjs/proxy';
 *
 * export const { GET, POST } = createRpcProxy({ router: appRouter });
 * ```
 */
import { NextRequest, NextResponse } from 'next/server';

import { env } from '@spfn/core/config';
import { logger } from '@spfn/core/logger';
import type { Router, RouteDef } from '@spfn/core/route';

import { interceptorRegistry } from './interceptors';
import { executeRequestInterceptors, executeResponseInterceptors, filterMatchingInterceptors } from './interceptors';
import {
    buildProxyHeaders,
    parseCookiesFromNextRequest,
    buildSetCookieHeader,
    buildErrorResponse,
    forwardResponseHeaders,
    parseResponseBody,
    collectInterceptors,
    buildRequestContext,
    buildResponseContext,
} from './helpers';
import type { TypedProxyConfig } from "./types";

const rpcLogger = logger.child('@spfn/core:rpc-proxy');

// ============================================================================
// Types
// ============================================================================

export interface RpcProxyConfig<TRouter extends Router<any>> extends Omit<TypedProxyConfig, 'onRequest' | 'onResponse'>
{
    /**
     * The router containing all route definitions
     */
    router: TRouter;

    /**
     * Additional routers from packages (e.g., @spfn/cms, @spfn/auth)
     *
     * These routers will be searched when the main router doesn't have the route.
     * Useful for packages that export their own routers and API clients.
     *
     * @example
     * ```typescript
     * import { cmsAppRouter } from '@spfn/cms/server';
     * import { authRouter } from '@spfn/auth/server';
     *
     * export const { GET, POST } = createRpcProxy({
     *     router: appRouter,
     *     packages: [cmsAppRouter, authRouter],
     * });
     * ```
     */
    packages?: Router<any>[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Type guard to check if value is a RouteDef
 */
function isRouteDef(value: unknown): value is RouteDef<any>
{
    return value !== null &&
        typeof value === 'object' &&
        'handler' in value &&
        'method' in value &&
        'path' in value;
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
 * Get route definition from router by dotted path
 *
 * @example
 * getRouteByPath(router, 'users.getUser') → RouteDef
 * getRouteByPath(router, 'getUser') → RouteDef
 */
function getRouteByPath(router: Router<any>, routePath: string): RouteDef<any> | null
{
    const parts = routePath.split('.');
    let current: any = router.routes;

    for (const part of parts)
    {
        if (!current || typeof current !== 'object')
        {
            return null;
        }

        const next = current[part];

        if (isRouter(next))
        {
            current = next.routes;
        }
        else if (isRouteDef(next))
        {
            return next;
        }
        else
        {
            current = next;
        }
    }

    if (isRouteDef(current))
    {
        return current;
    }

    return null;
}

/**
 * Build URL with path parameters replaced
 */
function buildUrlWithParams(path: string, params: Record<string, any>): string
{
    let url = path;
    for (const [key, value] of Object.entries(params))
    {
        url = url.replace(`:${key}`, encodeURIComponent(String(value)));
    }
    return url;
}

/**
 * Build query string from object
 */
function buildQueryString(query: Record<string, any>): string
{
    if (Object.keys(query).length === 0)
    {
        return '';
    }

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
    {
        if (Array.isArray(value))
        {
            value.forEach((v) => searchParams.append(key, String(v)));
        }
        else
        {
            searchParams.append(key, String(value));
        }
    }

    return `?${searchParams.toString()}`;
}

// ============================================================================
// RPC Proxy Handler
// ============================================================================

/**
 * Create RPC proxy handler for Next.js API Route
 *
 * Handles requests in the format:
 * - GET /api/rpc/{routeName}?input={...}
 * - POST /api/rpc/{routeName} with body
 *
 * Resolves routeName to actual HTTP method and path from the router,
 * then forwards to SPFN backend.
 */
export function createRpcProxy<TRouter extends Router<any>>(config: RpcProxyConfig<TRouter>)
{
    const {
        router,
        packages = [],
        apiUrl = env.SPFN_API_URL || 'http://localhost:8790',
        debug = env.NODE_ENV === 'development',
        timeout = 30000,
        headers: defaultHeaders = {},
        interceptors,
        autoDiscoverInterceptors = true,
        disableAutoInterceptors,
    } = config;

    /**
     * Handle RPC request
     */
    async function handleRpc(
        request: NextRequest,
        context: { params: Promise<{ routeName?: string }> }
    ): Promise<NextResponse>
    {
        const startTime = Date.now();
        const params = await context.params;

        try
        {
            const routeName = params.routeName;

            if (!routeName)
            {
                return NextResponse.json(
                    buildErrorResponse('Bad Request', 'Missing routeName parameter', debug),
                    { status: 400 }
                );
            }

            // Parse input from query string (GET) or body (POST)
            let input: {
                params?: Record<string, any>;
                query?: Record<string, any>;
                body?: Record<string, any>;
            } = {};

            if (request.method === 'GET')
            {
                const inputParam = request.nextUrl.searchParams.get('input');
                if (inputParam)
                {
                    try
                    {
                        input = JSON.parse(decodeURIComponent(inputParam));
                    }
                    catch
                    {
                        return NextResponse.json(
                            buildErrorResponse('Bad Request', 'Invalid input parameter', debug),
                            { status: 400 }
                        );
                    }
                }
            }
            else
            {
                // POST - parse body
                try
                {
                    input = await request.json();
                }
                catch
                {
                    return NextResponse.json(
                        buildErrorResponse('Bad Request', 'Invalid JSON body', debug),
                        { status: 400 }
                    );
                }
            }

            // Get route definition from router (try main router first, then packages)
            let routeDef = getRouteByPath(router, routeName);

            // If not found in main router, search in package routers
            if (!routeDef && packages.length > 0)
            {
                for (const pkgRouter of packages)
                {
                    routeDef = getRouteByPath(pkgRouter, routeName);
                    if (routeDef)
                    {
                        if (debug)
                        {
                            rpcLogger.debug(`Route "${routeName}" found in package router`);
                        }
                        break;
                    }
                }
            }

            if (!routeDef)
            {
                rpcLogger.warn(`Route not found: ${routeName}`);
                return NextResponse.json(
                    buildErrorResponse('Not Found', `Route "${routeName}" not found in router`, debug),
                    { status: 404 }
                );
            }

            const { method: targetMethod, path: targetPath } = routeDef;

            if (!targetMethod || !targetPath)
            {
                rpcLogger.warn(`Route "${routeName}" is missing method or path`);
                return NextResponse.json(
                    buildErrorResponse('Internal Error', `Route "${routeName}" is misconfigured`, debug),
                    { status: 500 }
                );
            }

            // Build target URL with params and query
            const inputParams = input.params || {};
            const inputQuery = input.query || {};
            const inputBody = input.body;

            const resolvedPath = buildUrlWithParams(targetPath, inputParams);
            const queryString = buildQueryString(inputQuery);
            const targetUrl = `${apiUrl}${resolvedPath}${queryString}`;

            if (debug)
            {
                rpcLogger.debug('→ RPC request', {
                    routeName,
                    targetMethod,
                    targetPath: resolvedPath,
                    targetUrl,
                    hasBody: !!inputBody,
                });
            }

            // Build headers
            const headers = buildProxyHeaders(request.headers, defaultHeaders);

            // Build fetch options
            const fetchOptions: RequestInit = {
                method: targetMethod,
                headers,
            };

            // Add body for POST/PUT/PATCH
            if (['POST', 'PUT', 'PATCH'].includes(targetMethod) && inputBody)
            {
                fetchOptions.body = JSON.stringify(inputBody);
            }

            // ============================================================
            // Advanced Interceptors - BEFORE FETCH
            // ============================================================

            // Collect and filter interceptors
            const allInterceptors = collectInterceptors(autoDiscoverInterceptors, disableAutoInterceptors, interceptors, interceptorRegistry);
            const matchingInterceptors = filterMatchingInterceptors(allInterceptors, resolvedPath, targetMethod);

            if (debug && matchingInterceptors.length > 0)
            {
                rpcLogger.debug(`🎯 Found ${matchingInterceptors.length} matching interceptors for ${targetMethod} ${resolvedPath}`);
            }

            // Create RequestInterceptorContext
            const cookiesMap = parseCookiesFromNextRequest(request);
            const requestCtx = buildRequestContext(
                resolvedPath.slice(1), // Remove leading slash
                targetMethod,
                headers,
                inputBody,
                new URLSearchParams(queryString.slice(1)), // Remove leading ?
                cookiesMap,
                request
            );

            // Execute request interceptors
            const requestInterceptorsToRun = matchingInterceptors.map(r => r.request).filter((i): i is NonNullable<typeof i> => !!i);
            if (requestInterceptorsToRun.length > 0)
            {
                await executeRequestInterceptors(requestCtx, requestInterceptorsToRun);

                // Apply modified headers
                for (const [key, value] of Object.entries(requestCtx.headers))
                {
                    headers.set(key, value);
                }

                // Apply modified body
                if (requestCtx.body)
                {
                    fetchOptions.body = JSON.stringify(requestCtx.body);
                }
            }

            // Execute fetch with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            try
            {
                const response = await fetch(targetUrl, {
                    ...fetchOptions,
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                // Parse response
                let body = await parseResponseBody(response);

                // ============================================================
                // Advanced Interceptors - AFTER FETCH
                // ============================================================

                // Create ResponseInterceptorContext
                const responseCtx = buildResponseContext(
                    resolvedPath.slice(1),
                    targetMethod,
                    headers,
                    inputBody,
                    response,
                    body,
                    requestCtx.metadata
                );

                // Execute response interceptors
                const responseInterceptorsToRun = matchingInterceptors.map(r => r.response).filter((i): i is NonNullable<typeof i> => !!i);
                if (responseInterceptorsToRun.length > 0)
                {
                    await executeResponseInterceptors(responseCtx, responseInterceptorsToRun);
                    body = responseCtx.response.body;
                }

                const duration = Date.now() - startTime;

                if (debug)
                {
                    rpcLogger.debug('← RPC response', {
                        routeName,
                        status: responseCtx.response.status,
                        duration: `${duration}ms`,
                    });
                }

                // Build Next.js response
                const nextResponse = NextResponse.json(body, {
                    status: responseCtx.response.status,
                    statusText: responseCtx.response.statusText,
                });

                // Forward response headers
                forwardResponseHeaders(response.headers, nextResponse.headers);

                // Apply setCookies from interceptors
                for (const cookie of responseCtx.setCookies)
                {
                    const setCookieHeader = buildSetCookieHeader(cookie);
                    nextResponse.headers.append('Set-Cookie', setCookieHeader);

                    if (debug)
                    {
                        rpcLogger.debug('🍪 Set-Cookie header added', {
                            name: cookie.name,
                        });
                    }
                }

                return nextResponse;
            }
            catch (error)
            {
                clearTimeout(timeoutId);

                // Handle timeout
                if (error instanceof Error && error.name === 'AbortError')
                {
                    rpcLogger.error('Request timeout', {
                        routeName,
                        targetUrl,
                        timeout,
                    });

                    return NextResponse.json(
                        buildErrorResponse('Gateway Timeout', `Request timed out after ${timeout}ms`, debug, error),
                        { status: 504 }
                    );
                }

                // Handle other fetch errors
                const fetchErr = error as Error;
                rpcLogger.error('Fetch error', {
                    routeName,
                    targetUrl,
                    error: fetchErr.message,
                });

                return NextResponse.json(
                    buildErrorResponse('Bad Gateway', fetchErr.message || 'Failed to connect to backend', debug, fetchErr),
                    { status: 502 }
                );
            }
        }
        catch (error)
        {
            const duration = Date.now() - startTime;
            const err = error as Error;

            rpcLogger.error('RPC proxy error', {
                error: err.message,
                stack: err.stack,
                duration: `${duration}ms`,
            });

            return NextResponse.json(
                buildErrorResponse('Internal Server Error', err.message || 'Unknown error', debug, err),
                { status: 500 }
            );
        }
    }

    // Return route handlers
    return {
        GET: (req: NextRequest, context: { params: Promise<{ routeName?: string }> }) =>
            handleRpc(req, context),
        POST: (req: NextRequest, context: { params: Promise<{ routeName?: string }> }) =>
            handleRpc(req, context),
    };
}