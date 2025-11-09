/**
 * SPFN Next.js API Route Proxy with Interceptor Pattern
 *
 * Automatically proxies requests to SPFN API server with:
 * - Cookie forwarding
 * - Request/Response interceptors
 * - Flexible header manipulation
 *
 * Usage:
 * ```typescript
 * // Basic usage (no interceptors)
 * // app/api/actions/[...path]/route.ts
 * export { GET, POST, PUT, DELETE, PATCH } from '@spfn/core/nextjs';
 *
 * // With interceptors
 * import { createProxy } from '@spfn/core/nextjs';
 *
 * export const { GET, POST } = createProxy({
 *   interceptors: [
 *     {
 *       pathPattern: '/_auth/*',
 *       request: async (ctx, next) => {
 *         ctx.headers['Authorization'] = 'Bearer token';
 *         await next();
 *       }
 *     }
 *   ]
 * });
 * ```
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers.js';
import type { ProxyConfig, RequestInterceptorContext, ResponseInterceptorContext, InterceptorRule } from './types';
import {
    filterMatchingInterceptors,
    executeRequestInterceptors,
    executeResponseInterceptors,
} from './interceptor';
import { interceptorRegistry } from './registry';

/**
 * Get SPFN API URL from environment or config
 */
function getApiUrl(config?: ProxyConfig): string
{
    return (
        config?.apiUrl ||
        process.env.SERVER_API_URL ||
        process.env.SPFN_API_URL ||
        'http://localhost:8790'
    );
}

/**
 * Generic proxy handler for all HTTP methods
 */
async function handleProxy(
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> | { path: string[] } },
    method: string,
    config?: ProxyConfig
): Promise<NextResponse>
{
    try
    {
        // Resolve params (Next.js 15+ async params support)
        const params = 'then' in context.params ? await context.params : context.params;
        const pathSegments = params.path;
        const path = `/${pathSegments.join('/')}`;

        // Get query parameters
        const query: Record<string, string | string[]> = {};
        request.nextUrl.searchParams.forEach((value, key) => {
            const existing = query[key];
            if (existing)
            {
                query[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
            }
            else
            {
                query[key] = value;
            }
        });

        // Get cookies
        const cookieStore = await cookies();
        const cookieMap = new Map<string, string>();
        cookieStore.getAll().forEach((cookie) => {
            cookieMap.set(cookie.name, cookie.value);
        });

        // Prepare initial headers
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        // Get request body
        let body: any = undefined;
        const contentType = request.headers.get('Content-Type');

        if (method === 'POST' || method === 'PUT' || method === 'PATCH')
        {
            if (contentType?.includes('application/json'))
            {
                const text = await request.text();
                if (text)
                {
                    try
                    {
                        body = JSON.parse(text);
                    }
                    catch (error)
                    {
                        body = text;
                    }
                }
            }
            else if (contentType?.includes('multipart/form-data'))
            {
                body = await request.formData();
            }
            else
            {
                body = await request.text();
            }
        }

        // Create request interceptor context
        const requestContext: RequestInterceptorContext = {
            path,
            method,
            headers,
            body,
            query,
            cookies: cookieMap,
            request,
            metadata: {},
        };

        // Execute request interceptors
        const rules = config?.interceptors || [];
        console.log(`[SPFN Proxy] Handling ${method} ${path}`);
        console.log(`[SPFN Proxy] Total available interceptor rules: ${rules.length}`);

        const matchedRules = filterMatchingInterceptors(rules, path, method);
        console.log(`[SPFN Proxy] Matched ${matchedRules.length} interceptor rules for this request`);

        const requestInterceptors = matchedRules
            .map((rule) => rule.request)
            .filter((interceptor): interceptor is NonNullable<typeof interceptor> => !!interceptor);

        console.log(`[SPFN Proxy] Executing ${requestInterceptors.length} request interceptors`);

        await executeRequestInterceptors(requestContext, requestInterceptors);

        // Build SPFN API URL
        const apiUrl = getApiUrl(config);
        const queryString = Object.entries(query)
            .flatMap(([key, value]) =>
                Array.isArray(value) ? value.map((v) => `${key}=${v}`) : [`${key}=${value}`]
            )
            .join('&');
        const url = `${apiUrl}${path}${queryString ? `?${queryString}` : ''}`;

        // Build fetch options
        const init: RequestInit = {
            method,
            headers: requestContext.headers,
        };

        // Add body for POST/PUT/PATCH
        if (requestContext.body !== undefined)
        {
            if (requestContext.body instanceof FormData)
            {
                init.body = requestContext.body;
                // Remove Content-Type to let fetch set it with boundary
                delete requestContext.headers['Content-Type'];
            }
            else if (typeof requestContext.body === 'string')
            {
                init.body = requestContext.body;
            }
            else
            {
                init.body = JSON.stringify(requestContext.body);
            }
        }

        if (config?.debug)
        {
            console.log(`[SPFN Proxy] Calling ${url}`);
            console.log(`[SPFN Proxy] Headers:`, requestContext.headers);
        }

        // Call SPFN API
        const response = await fetch(url, init);
        const responseText = await response.text();

        // Parse response body
        let responseBody: any;
        try
        {
            responseBody = JSON.parse(responseText);
        }
        catch (error)
        {
            responseBody = responseText;
        }

        // Create response interceptor context
        const responseContext: ResponseInterceptorContext = {
            path,
            method,
            request: {
                headers: requestContext.headers,
                body: requestContext.body,
            },
            response: {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                body: responseBody,
            },
            setCookies: [],
            metadata: requestContext.metadata, // Pass metadata from request
        };

        // Execute response interceptors
        const responseInterceptors = matchedRules
            .map((rule) => rule.response)
            .filter((interceptor): interceptor is NonNullable<typeof interceptor> => !!interceptor);

        if (config?.debug)
        {
            console.log(`[SPFN Proxy] Response interceptors: ${responseInterceptors.length}`);
        }

        await executeResponseInterceptors(responseContext, responseInterceptors);

        // Create NextResponse
        const nextResponse = NextResponse.json(responseContext.response.body, {
            status: responseContext.response.status,
            statusText: responseContext.response.statusText,
        });

        // Set cookies from interceptors
        for (const cookie of responseContext.setCookies)
        {
            const cookieString = [`${cookie.name}=${cookie.value}`];

            if (cookie.options?.httpOnly)
            {
                cookieString.push('HttpOnly');
            }
            if (cookie.options?.secure)
            {
                cookieString.push('Secure');
            }
            if (cookie.options?.sameSite)
            {
                cookieString.push(`SameSite=${cookie.options.sameSite}`);
            }
            if (cookie.options?.maxAge !== undefined)
            {
                cookieString.push(`Max-Age=${cookie.options.maxAge}`);
            }
            if (cookie.options?.path)
            {
                cookieString.push(`Path=${cookie.options.path}`);
            }
            if (cookie.options?.domain)
            {
                cookieString.push(`Domain=${cookie.options.domain}`);
            }

            nextResponse.headers.append('Set-Cookie', cookieString.join('; '));
        }

        // Forward Set-Cookie from SPFN API response
        const setCookieHeaders = response.headers.get('Set-Cookie');
        if (setCookieHeaders)
        {
            nextResponse.headers.append('Set-Cookie', setCookieHeaders);
        }

        if (config?.debug)
        {
            console.log(`[SPFN Proxy] Response: ${responseContext.response.status}`);
        }

        return nextResponse;
    }
    catch (error)
    {
        console.error('[SPFN Proxy] Error:', error);

        return NextResponse.json(
            {
                success: false,
                error: {
                    code: 'PROXY_ERROR',
                    message: error instanceof Error ? error.message : 'Unknown proxy error',
                },
            },
            { status: 500 }
        );
    }
}

/**
 * Create proxy with custom configuration and interceptors
 *
 * @param config - Proxy configuration with interceptors
 * @returns HTTP method handlers for Next.js API routes
 *
 * @example
 * ```typescript
 * // app/api/actions/[...path]/route.ts
 * import { createProxy } from '@spfn/core/nextjs';
 *
 * export const { GET, POST, PUT, DELETE, PATCH } = createProxy({
 *   apiUrl: 'http://localhost:8790',
 *   debug: true,
 *   interceptors: [
 *     {
 *       pathPattern: '/_auth/*',
 *       method: 'POST',
 *       request: async (ctx, next) => {
 *         const session = await getSession();
 *         if (session) {
 *           ctx.headers['Authorization'] = `Bearer ${session.token}`;
 *         }
 *         await next();
 *       },
 *       response: async (ctx, next) => {
 *         if (ctx.response.status === 200) {
 *           ctx.setCookies.push({
 *             name: 'session',
 *             value: ctx.response.body.token,
 *             options: { httpOnly: true, maxAge: 3600 }
 *           });
 *         }
 *         await next();
 *       }
 *     }
 *   ]
 * });
 * ```
 */
export function createProxy(config?: ProxyConfig)
{
    // Merge auto-discovered and custom interceptors
    const finalConfig = {
        autoDiscoverInterceptors: true,
        ...config,
    };

    let allInterceptors: InterceptorRule[] = [];

    console.log('[SPFN Proxy] Creating proxy with config:', {
        autoDiscoverInterceptors: finalConfig.autoDiscoverInterceptors,
        customInterceptors: finalConfig.interceptors?.length || 0,
        disableAutoInterceptors: finalConfig.disableAutoInterceptors || [],
    });

    // Auto-discover interceptors from registry
    if (finalConfig.autoDiscoverInterceptors)
    {
        const registeredPackages = interceptorRegistry.getPackageNames();
        console.log('[SPFN Proxy] Registered packages in registry:', registeredPackages);

        const autoInterceptors = interceptorRegistry.getAll(
            finalConfig.disableAutoInterceptors || []
        );
        allInterceptors.push(...autoInterceptors);

        console.log('[SPFN Proxy] Auto-discovered interceptors from packages:', registeredPackages);
        console.log(`[SPFN Proxy] Total auto-discovered interceptors: ${autoInterceptors.length}`);
    }

    // Add custom interceptors
    if (finalConfig.interceptors)
    {
        allInterceptors.push(...finalConfig.interceptors);
        console.log(`[SPFN Proxy] Custom interceptors: ${finalConfig.interceptors.length}`);
    }

    // Create final config with merged interceptors
    const proxyConfig: ProxyConfig = {
        ...finalConfig,
        interceptors: allInterceptors,
    };

    console.log(`[SPFN Proxy] Total interceptors loaded: ${allInterceptors.length}`);

    return {
        GET: async (
            request: NextRequest,
            context: { params: Promise<{ path: string[] }> | { path: string[] } }
        ) => handleProxy(request, context, 'GET', proxyConfig),

        POST: async (
            request: NextRequest,
            context: { params: Promise<{ path: string[] }> | { path: string[] } }
        ) => handleProxy(request, context, 'POST', proxyConfig),

        PUT: async (
            request: NextRequest,
            context: { params: Promise<{ path: string[] }> | { path: string[] } }
        ) => handleProxy(request, context, 'PUT', proxyConfig),

        PATCH: async (
            request: NextRequest,
            context: { params: Promise<{ path: string[] }> | { path: string[] } }
        ) => handleProxy(request, context, 'PATCH', proxyConfig),

        DELETE: async (
            request: NextRequest,
            context: { params: Promise<{ path: string[] }> | { path: string[] } }
        ) => handleProxy(request, context, 'DELETE', proxyConfig),
    };
}

/**
 * Default proxy with lazy initialization
 *
 * Lazy initialization ensures that auto-registered interceptors
 * are loaded before the proxy is created.
 *
 * @example
 * ```typescript
 * // app/api/actions/[...path]/route.ts
 * export { GET, POST, PUT, DELETE, PATCH } from '@spfn/core/nextjs';
 * ```
 */
let defaultProxy: ReturnType<typeof createProxy> | null = null;

function getDefaultProxy(): ReturnType<typeof createProxy>
{
    if (!defaultProxy)
    {
        console.log('[SPFN Proxy] Initializing default proxy with auto-discovery');
        defaultProxy = createProxy();
    }
    return defaultProxy;
}

export const GET = async (
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> | { path: string[] } }
) => getDefaultProxy().GET(request, context);

export const POST = async (
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> | { path: string[] } }
) => getDefaultProxy().POST(request, context);

export const PUT = async (
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> | { path: string[] } }
) => getDefaultProxy().PUT(request, context);

export const PATCH = async (
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> | { path: string[] } }
) => getDefaultProxy().PATCH(request, context);

export const DELETE = async (
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> | { path: string[] } }
) => getDefaultProxy().DELETE(request, context);