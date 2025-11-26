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

import { env } from '@spfn/core/config';
import { logger } from '@spfn/core/logger';

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

const proxyLogger = logger.child('@spfn/core:proxy');

// ============================================================================
// Proxy Handler
// ============================================================================

/**
 * Create proxy handler for Next.js API Route
 */
export function createTypedProxy(config: TypedProxyConfig = {})
{
    const {
        apiUrl = env.SPFN_API_URL || 'http://localhost:8790',
        debug = env.NODE_ENV === 'development',
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
        const params = await context.params;

        try
        {
            const path = (params.path || []).join('/');
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
            const headers = buildProxyHeaders(request.headers, defaultHeaders);

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

            // Collect and filter interceptors
            const allInterceptors = collectInterceptors(autoDiscoverInterceptors, disableAutoInterceptors, interceptors, interceptorRegistry);
            const matchingInterceptors = filterMatchingInterceptors(allInterceptors, `/${path}`, method);

            proxyLogger.debug(`🎯 Found ${matchingInterceptors.length} matching interceptors for ${method} /${path}`);

            // Create RequestInterceptorContext
            const requestBody = fetchOptions.body ? JSON.parse(fetchOptions.body as string) : undefined;
            const cookiesMap = parseCookiesFromNextRequest(request);
            const requestCtx = buildRequestContext(path, method, headers, requestBody, searchParams, cookiesMap, request);

            if (debug)
            {
                proxyLogger.debug(`🍪 Parsed cookies for interceptors`, {
                    fromNextRequest: request.cookies.getAll().length,
                    fromCookieHeader: request.headers.get('cookie') ? 'present' : 'absent',
                    totalCookies: cookiesMap.size,
                    cookieNames: Array.from(cookiesMap.keys()),
                });
            }

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
                let body = await parseResponseBody(response);

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
                const responseCtx = buildResponseContext(path, method, headers, requestBody, response, body, requestCtx.metadata);

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
                forwardResponseHeaders(response.headers, nextResponse.headers);


                // Apply setCookies from interceptors
                if (responseCtx.setCookies.length > 0)
                {
                    proxyLogger.debug(`🍪 Setting ${responseCtx.setCookies.length} cookie(s) from interceptors`);
                }

                for (const cookie of responseCtx.setCookies)
                {
                    const setCookieHeader = buildSetCookieHeader(cookie);
                    nextResponse.headers.append('Set-Cookie', setCookieHeader);

                    if (debug)
                    {
                        proxyLogger.debug('🍪 Set-Cookie header added', {
                            name: cookie.name,
                            valueLength: cookie.value.length,
                            options: cookie.options,
                            headerPreview: setCookieHeader.substring(0, 100) + (setCookieHeader.length > 100 ? '...' : ''),
                        });
                    }
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
                        buildErrorResponse('Request Timeout', `Request to SPFN API timed out after ${timeout}ms`, debug, error),
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
                    buildErrorResponse('Bad Gateway', fetchErr.message || 'Failed to connect to backend', debug, fetchErr),
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
                params: params,
                duration: `${duration}ms`,
            });

            return NextResponse.json(
                buildErrorResponse('Proxy Error', err.message || 'Unknown error', debug, err),
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