/**
 * RPC-Style Proxy for define-route System
 *
 * Next.js API Route handler that resolves routeName to method/path
 * and forwards requests to SPFN backend.
 *
 * @example Using routeMap (recommended - no server code loaded)
 * ```typescript
 * // app/api/rpc/[routeName]/route.ts
 * import { routeMap } from '@/generated/route-map';
 * import { createRpcProxy } from '@spfn/core/nextjs/proxy';
 *
 * export const { GET, POST } = createRpcProxy({ routeMap });
 * ```
 *
 * @example Using router (legacy - loads full server code)
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
import type { Router, RouteDef, HttpMethod } from '@spfn/core/route';

import { buildUrlWithParams, buildQueryString } from '../shared';
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

/**
 * Route info from generated route map
 */
export interface RouteMapEntry
{
    method: HttpMethod;
    path: string;
}

/**
 * Generated route map type
 */
export type RouteMap = Record<string, RouteMapEntry>;

/**
 * Base config for RPC proxy
 */
interface RpcProxyBaseConfig extends Omit<TypedProxyConfig, 'onRequest' | 'onResponse'> {}

/**
 * Config using routeMap (recommended)
 *
 * Uses generated route map file - no server code loaded in Next.js process.
 */
export interface RpcProxyRouteMapConfig extends RpcProxyBaseConfig
{
    /**
     * Generated route map containing routeName → {method, path} mappings
     *
     * @example
     * ```typescript
     * import { routeMap } from '@/generated/route-map';
     *
     * export const { GET, POST } = createRpcProxy({ routeMap });
     * ```
     */
    routeMap: RouteMap;
    router?: never;
}

/**
 * Config using router (legacy)
 *
 * @deprecated Use routeMap instead to avoid loading server code in Next.js process
 */
export interface RpcProxyRouterConfig<TRouter extends Router<any>> extends RpcProxyBaseConfig
{
    /**
     * The router containing all route definitions
     *
     * @deprecated Use routeMap instead - router imports all server code
     *
     * @example
     * ```typescript
     * export const { GET, POST } = createRpcProxy({
     *     router: appRouter,
     * });
     * ```
     */
    router: TRouter;
    routeMap?: never;
}

/**
 * Combined config type
 */
export type RpcProxyConfig<TRouter extends Router<any> = Router<any>> =
    | RpcProxyRouteMapConfig
    | RpcProxyRouterConfig<TRouter>;

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
 * Resolves routeName to actual HTTP method and path from the router or routeMap,
 * then forwards to SPFN backend.
 */
export function createRpcProxy<TRouter extends Router<any>>(config: RpcProxyConfig<TRouter>)
{
    const {
        apiUrl = env.SPFN_API_URL || 'http://localhost:8790',
        debug = env.NODE_ENV === 'development',
        timeout = env.RPC_PROXY_TIMEOUT,
        headers: defaultHeaders = {},
        interceptors,
        autoDiscoverInterceptors = true,
        disableAutoInterceptors,
    } = config;

    // Determine if using routeMap or router
    const useRouteMap = 'routeMap' in config && config.routeMap !== undefined;
    const routeMap = useRouteMap ? config.routeMap : null;
    const router = !useRouteMap && 'router' in config ? config.router : null;

    // Get package routers (only when using router mode)
    const packageRouters = router?._packageRouters || [];

    /**
     * Resolve route info from routeMap or router
     */
    function resolveRoute(routeName: string): { method: string; path: string } | null
    {
        // Try routeMap first (recommended)
        if (routeMap)
        {
            const entry = routeMap[routeName];
            if (entry)
            {
                return { method: entry.method, path: entry.path };
            }
            return null;
        }

        // Fall back to router (legacy)
        if (router)
        {
            let routeDef = getRouteByPath(router, routeName);

            // If not found in main router, search in package routers
            if (!routeDef && packageRouters.length > 0)
            {
                for (const pkgRouter of packageRouters)
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

            if (routeDef && routeDef.method && routeDef.path)
            {
                return { method: routeDef.method, path: routeDef.path };
            }
        }

        return null;
    }

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
                formData?: Record<string, any>;
                headers?: Record<string, any>;
                cookies?: Record<string, any>;
            } = {};
            let rawFormData: FormData | null = null;

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
                // POST - check Content-Type for formData vs JSON
                const contentType = request.headers.get('content-type') || '';

                if (contentType.includes('multipart/form-data'))
                {
                    // Parse multipart/form-data
                    try
                    {
                        rawFormData = await request.formData();

                        // Extract __metadata if present (contains params, query, etc.)
                        const metadataStr = rawFormData.get('__metadata');
                        if (metadataStr && typeof metadataStr === 'string')
                        {
                            const metadata = JSON.parse(metadataStr);
                            input.params = metadata.params;
                            input.query = metadata.query;
                            input.headers = metadata.headers;
                            input.cookies = metadata.cookies;
                        }

                        // Collect formData fields (excluding __metadata)
                        input.formData = {};
                        rawFormData.forEach((value, key) =>
                        {
                            if (key === '__metadata') return;

                            const existing = input.formData![key];
                            if (existing !== undefined)
                            {
                                // Multiple values with same key
                                if (Array.isArray(existing))
                                {
                                    existing.push(value);
                                }
                                else
                                {
                                    input.formData![key] = [existing, value];
                                }
                            }
                            else
                            {
                                input.formData![key] = value;
                            }
                        });
                    }
                    catch (error)
                    {
                        return NextResponse.json(
                            buildErrorResponse('Bad Request', 'Invalid form data', debug),
                            { status: 400 }
                        );
                    }
                }
                else
                {
                    // Parse JSON body
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
            }

            // Resolve route info from routeMap or router
            const routeInfo = resolveRoute(routeName);

            if (!routeInfo)
            {
                rpcLogger.warn(`Route not found: ${routeName}`);
                return NextResponse.json(
                    buildErrorResponse('Not Found', `Route "${routeName}" not found`, debug),
                    { status: 404 }
                );
            }

            const { method: targetMethod, path: targetPath } = routeInfo;

            // Build target URL with params and query
            const inputParams = input.params || {};
            const inputQuery = input.query || {};
            const inputBody = input.body;
            const inputFormData = input.formData;
            const hasFormData = rawFormData !== null && inputFormData && Object.keys(inputFormData).length > 0;

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
                    hasFormData,
                });
            }

            // Build headers
            const headers = buildProxyHeaders(request.headers, defaultHeaders);

            // Remove Content-Type for formData (let fetch set it with boundary)
            if (hasFormData)
            {
                headers.delete('content-type');
            }

            // Build fetch options
            const fetchOptions: RequestInit = {
                method: targetMethod,
                headers,
            };

            // Add body for POST/PUT/PATCH
            if (['POST', 'PUT', 'PATCH'].includes(targetMethod))
            {
                if (hasFormData && rawFormData)
                {
                    // Forward formData to backend (rebuild without __metadata)
                    const forwardFormData = new FormData();
                    rawFormData.forEach((value, key) =>
                    {
                        if (key !== '__metadata')
                        {
                            forwardFormData.append(key, value);
                        }
                    });
                    fetchOptions.body = forwardFormData;
                }
                else if (inputBody)
                {
                    fetchOptions.body = JSON.stringify(inputBody);
                }
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
                    requestCtx.metadata,
                    requestCtx.cookies
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
                // 204 No Content should use NextResponse directly, not NextResponse.json()
                const nextResponse = responseCtx.response.status === 204
                    ? new NextResponse(null, {
                        status: 204,
                        statusText: responseCtx.response.statusText,
                    })
                    : NextResponse.json(body, {
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