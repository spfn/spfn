/**
 * Type-Safe Proxy for define-route System
 *
 * Next.js API Route handler that forwards requests to SPFN backend.
 * Works seamlessly with typed-client.ts for full type safety.
 *
 * @example
 * ```typescript
 * // app/api/actions/[...path]/route.ts
 * export { GET, POST, PUT, PATCH, DELETE } from '@spfn/core/nextjs/typed-proxy';
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@spfn/core/logger';
import { executeRequestInterceptors, executeResponseInterceptors, filterMatchingInterceptors } from './interceptor';
import { interceptorRegistry } from './registry';
import type { InterceptorRule, RequestInterceptorContext, ResponseInterceptorContext } from './types';

const proxyLogger = logger.child('@spfn/core:proxy');

// ============================================================================
// Configuration
// ============================================================================

/**
 * Request interceptor result
 */
export interface RequestInterceptorResult
{
    url: string;
    headers?: Record<string, string>;
}

/**
 * Response interceptor result
 */
export interface ResponseInterceptorResult
{
    response: Response;
    body: any;
}

/**
 * Request interceptor function
 */
export type ProxyRequestInterceptor = (
    req: NextRequest,
    url: string
) => Promise<RequestInterceptorResult> | RequestInterceptorResult;

/**
 * Response interceptor function
 */
export type ProxyResponseInterceptor = (
    response: Response,
    body: any
) => Promise<ResponseInterceptorResult> | ResponseInterceptorResult;

/**
 * Proxy configuration
 */
export interface TypedProxyConfig
{
    /**
     * SPFN API base URL
     *
     * @default process.env.SPFN_API_URL || 'http://localhost:8790'
     */
    apiUrl?: string;

    /**
     * Enable debug logging
     *
     * @default process.env.NODE_ENV === 'development'
     */
    debug?: boolean;

    /**
     * Request timeout in milliseconds
     *
     * @default 30000
     */
    timeout?: number;

    /**
     * Custom headers to add to all forwarded requests
     */
    headers?: Record<string, string>;

    /**
     * Simple request interceptor - modify request before forwarding
     *
     * For simple use cases. Use `interceptors` for advanced features like:
     * - Path/method matching
     * - Cookie setting
     * - Multiple interceptors with chaining
     */
    onRequest?: ProxyRequestInterceptor;

    /**
     * Simple response interceptor - modify response before returning
     *
     * For simple use cases. Use `interceptors` for advanced features.
     */
    onResponse?: ProxyResponseInterceptor;

    /**
     * Advanced interceptors with path matching, cookie support, and chaining
     *
     * @example
     * ```typescript
     * interceptors: [{
     *   pathPattern: '/_auth/*',
     *   method: 'POST',
     *   request: async (ctx, next) => {
     *     ctx.headers['Authorization'] = 'Bearer token';
     *     await next();
     *   },
     *   response: async (ctx, next) => {
     *     ctx.setCookies.push({
     *       name: 'session',
     *       value: 'xxx',
     *       options: { httpOnly: true, maxAge: 3600 }
     *     });
     *     await next();
     *   }
     * }]
     * ```
     */
    interceptors?: InterceptorRule[];

    /**
     * Enable automatic interceptor discovery from registry
     *
     * When enabled, interceptors registered via registerInterceptors()
     * are automatically applied.
     *
     * @default true
     */
    autoDiscoverInterceptors?: boolean;

    /**
     * Disable interceptors from specific packages
     *
     * @example ['auth', 'storage']
     */
    disableAutoInterceptors?: string[];
}

// ============================================================================
// Proxy Handler
// ============================================================================

/**
 * Create proxy handler for Next.js API Route
 */
export function createTypedProxy(config: TypedProxyConfig = {})
{
    const {
        apiUrl = process.env.SPFN_API_URL || 'http://localhost:8790',
        debug = process.env.NODE_ENV === 'development',
        timeout = 30000,
        headers: defaultHeaders = {},
        onRequest,
        onResponse,
        interceptors,
        autoDiscoverInterceptors = true,
        disableAutoInterceptors,
    } = config;

    /**
     * Handle proxy request
     */
    async function handleProxy(
        request: NextRequest,
        context: { params: Promise<{ path: string[] }> }
    ): Promise<NextResponse>
    {
        const startTime = Date.now();

        try
        {
            // Extract path from route params
            const params = await context.params;
            const pathArray = params.path || [];
            const path = pathArray.join('/');
            const method = request.method;

            // Build target URL
            let targetUrl = `${apiUrl}/${path}`;

            // Forward query parameters
            const searchParams = request.nextUrl.searchParams;
            if (searchParams.toString())
            {
                targetUrl += `?${searchParams.toString()}`;
            }

            if (debug)
            {
                proxyLogger.debug('→ Proxying request', {
                    method,
                    path: `/${path}`,
                    targetUrl,
                });
            }

            // Build headers
            const headers = new Headers();

            // Forward important headers from client
            const headersToForward = [
                'content-type',
                'authorization',
                'cookie',
                'user-agent',
                'accept',
                'accept-language',
            ];

            for (const header of headersToForward)
            {
                const value = request.headers.get(header);
                if (value)
                {
                    headers.set(header, value);
                }
            }

            // Add default headers
            for (const [key, value] of Object.entries(defaultHeaders))
            {
                headers.set(key, value);
            }

            // Execute request interceptor
            let interceptedUrl = targetUrl;

            if (onRequest)
            {
                const result = await onRequest(request, targetUrl);
                interceptedUrl = result.url;
                if (result.headers)
                {
                    for (const [key, value] of Object.entries(result.headers))
                    {
                        headers.set(key, value);
                    }
                }
            }

            // Build fetch options
            const fetchOptions: RequestInit = {
                method,
                headers,
            };

            // Forward body for POST/PUT/PATCH
            if (['POST', 'PUT', 'PATCH'].includes(method))
            {
                const body = await request.text();
                if (body)
                {
                    fetchOptions.body = body;
                }
            }

            // ============================================================
            // Advanced Interceptors - BEFORE FETCH
            // ============================================================

            // Collect interceptors
            let allInterceptors: InterceptorRule[] = [];

            // Auto-discover from registry
            if (autoDiscoverInterceptors)
            {
                const registeredInterceptors = interceptorRegistry.getAll(disableAutoInterceptors || []);
                allInterceptors.push(...registeredInterceptors);
            }

            // Add config interceptors
            if (interceptors)
            {
                allInterceptors.push(...interceptors);
            }

            // Filter matching interceptors
            const matchingInterceptors = filterMatchingInterceptors(allInterceptors, `/${path}`, method);

            proxyLogger.debug(`🎯 Found ${matchingInterceptors.length} matching interceptors for ${method} /${path}`);

            // Create RequestInterceptorContext
            const requestBody = fetchOptions.body ? JSON.parse(fetchOptions.body as string) : undefined;
            const requestCtx: RequestInterceptorContext = {
                path: `/${path}`,
                method,
                headers: Object.fromEntries(headers.entries()),
                body: requestBody,
                query: Object.fromEntries(searchParams.entries()),
                cookies: new Map(request.cookies.getAll().map(c => [c.name, c.value])),
                request,
                metadata: {},
            };

            proxyLogger.debug(`📦 Request body before interceptors:`, requestCtx.body);

            // Execute request interceptors
            const requestInterceptorsToRun = matchingInterceptors.map(r => r.request).filter((i): i is NonNullable<typeof i> => !!i);
            proxyLogger.debug(`🔄 Executing ${requestInterceptorsToRun.length} request interceptors`);
            await executeRequestInterceptors(requestCtx, requestInterceptorsToRun);

            proxyLogger.debug(`📦 Request body after interceptors:`, requestCtx.body);

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

            // Execute fetch with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            try
            {
                let response = await fetch(interceptedUrl, {
                    ...fetchOptions,
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                // Parse response
                const contentType = response.headers.get('content-type');
                let body: any;

                if (contentType?.includes('application/json'))
                {
                    const text = await response.text();
                    body = text ? JSON.parse(text) : null;
                }
                else
                {
                    body = await response.text();
                }

                // Execute simple response interceptor
                if (onResponse)
                {
                    const result = await onResponse(response, body);
                    response = result.response;
                    body = result.body;
                }

                // ============================================================
                // Advanced Interceptors - AFTER FETCH
                // ============================================================

                // Create ResponseInterceptorContext
                const responseCtx: ResponseInterceptorContext = {
                    path: `/${path}`,
                    method,
                    request: {
                        headers: Object.fromEntries(headers.entries()),
                        body: requestBody,
                    },
                    response: {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers,
                        body,
                    },
                    setCookies: [],
                    metadata: requestCtx.metadata,
                };

                // Execute response interceptors
                await executeResponseInterceptors(responseCtx, matchingInterceptors.map(r => r.response).filter((i): i is NonNullable<typeof i> => !!i));

                // Apply modified response
                body = responseCtx.response.body;

                const duration = Date.now() - startTime;

                if (debug)
                {
                    proxyLogger.debug('← Response received', {
                        method,
                        path: `/${path}`,
                        status: responseCtx.response.status,
                        duration: `${duration}ms`,
                    });
                }

                // Build Next.js response with modified body
                const nextResponse = NextResponse.json(body, {
                    status: responseCtx.response.status,
                    statusText: responseCtx.response.statusText,
                });

                // Forward response headers
                const headersToForwardBack = [
                    'content-type',
                    'cache-control',
                    'set-cookie',
                    'etag',
                    'last-modified',
                ];

                for (const header of headersToForwardBack)
                {
                    const value = response.headers.get(header);
                    if (value)
                    {
                        nextResponse.headers.set(header, value);
                    }
                }

                // Apply setCookies from interceptors
                for (const cookie of responseCtx.setCookies)
                {
                    const cookieStr = `${cookie.name}=${cookie.value}`;
                    const options = cookie.options || {};
                    const parts = [cookieStr];

                    if (options.httpOnly)
                    {
                        parts.push('HttpOnly');
                    }
                    if (options.secure)
                    {
                        parts.push('Secure');
                    }
                    if (options.sameSite)
                    {
                        parts.push(`SameSite=${options.sameSite}`);
                    }
                    if (options.maxAge)
                    {
                        parts.push(`Max-Age=${options.maxAge}`);
                    }
                    if (options.path)
                    {
                        parts.push(`Path=${options.path}`);
                    }
                    if (options.domain)
                    {
                        parts.push(`Domain=${options.domain}`);
                    }

                    nextResponse.headers.append('Set-Cookie', parts.join('; '));
                }

                return nextResponse;
            }
            catch (error)
            {
                clearTimeout(timeoutId);

                // Handle timeout specifically with 504
                if (error instanceof Error && error.name === 'AbortError')
                {
                    proxyLogger.error('Request timeout', {
                        method,
                        path: `/${path}`,
                        timeout,
                        error: error.message,
                        stack: error.stack,
                    });

                    return NextResponse.json(
                        {
                            error: 'Request Timeout',
                            message: `Request to SPFN API timed out after ${timeout}ms`,
                            ...(debug && { stack: error.stack }),
                        },
                        { status: 504 }
                    );
                }

                // Handle other fetch errors with 502
                const fetchErr = error as Error;
                proxyLogger.error('Fetch error', {
                    method,
                    path: `/${path}`,
                    error: fetchErr.message,
                    stack: fetchErr.stack,
                });

                return NextResponse.json(
                    {
                        error: 'Bad Gateway',
                        message: fetchErr.message || 'Failed to connect to backend',
                        ...(debug && { stack: fetchErr.stack }),
                    },
                    { status: 502 }
                );
            }
        }
        catch (error)
        {
            const duration = Date.now() - startTime;
            const err = error as Error;

            proxyLogger.error('Proxy error', {
                error: err.message,
                stack: err.stack,
                params: await context.params,
                duration: `${duration}ms`,
            });

            return NextResponse.json(
                {
                    error: 'Proxy Error',
                    message: err.message || 'Unknown error',
                    ...(debug && { stack: err.stack }),
                },
                { status: 500 }
            );
        }
    }

    // Return route handlers
    return {
        GET: (req: NextRequest, context: { params: Promise<{ path: string[] }> }) =>
            handleProxy(req, context),
        POST: (req: NextRequest, context: { params: Promise<{ path: string[] }> }) =>
            handleProxy(req, context),
        PUT: (req: NextRequest, context: { params: Promise<{ path: string[] }> }) =>
            handleProxy(req, context),
        PATCH: (req: NextRequest, context: { params: Promise<{ path: string[] }> }) =>
            handleProxy(req, context),
        DELETE: (req: NextRequest, context: { params: Promise<{ path: string[] }> }) =>
            handleProxy(req, context),
    };
}

// ============================================================================
// Default Export (Zero Config)
// ============================================================================

/**
 * Default proxy handlers with zero configuration
 *
 * @example
 * ```typescript
 * // app/api/actions/[...path]/route.ts
 * export { GET, POST, PUT, PATCH, DELETE } from '@spfn/core/nextjs/typed-proxy';
 * ```
 */
const defaultProxy = createTypedProxy();

export const GET = defaultProxy.GET;
export const POST = defaultProxy.POST;
export const PUT = defaultProxy.PUT;
export const PATCH = defaultProxy.PATCH;
export const DELETE = defaultProxy.DELETE;