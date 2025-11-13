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
import { cookies } from 'next/headers';
import type { ProxyConfig, RequestInterceptorContext, ResponseInterceptorContext, InterceptorRule } from './types';
import {
    filterMatchingInterceptors,
    executeRequestInterceptors,
    executeResponseInterceptors,
} from './interceptor';
import { interceptorRegistry } from './registry';
import { logger } from '../../logger';

// Logger for Next.js proxy
const proxyLogger = logger.child('@spfn/core:nextjs-proxy');

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
        proxyLogger.debug('Handling request', { method, path });
        proxyLogger.debug('Total available interceptor rules', { count: rules.length });

        // Log all available rules
        if (rules.length > 0)
        {
            rules.forEach((rule, index) => {
                proxyLogger.debug('Rule configuration', {
                    index,
                    pathPattern: rule.pathPattern?.toString(),
                    method: rule.method,
                });
            });
        }

        const matchedRules = filterMatchingInterceptors(rules, path, method);
        proxyLogger.debug('Matched interceptor rules', { count: matchedRules.length });

        // Log matched rules
        if (matchedRules.length > 0)
        {
            matchedRules.forEach((rule, index) => {
                proxyLogger.debug('Matched rule details', {
                    index,
                    pathPattern: rule.pathPattern?.toString(),
                    method: rule.method,
                    hasRequestInterceptor: !!rule.request,
                    hasResponseInterceptor: !!rule.response,
                });
            });
        }

        const requestInterceptors = matchedRules
            .map((rule) => rule.request)
            .filter((interceptor): interceptor is NonNullable<typeof interceptor> => !!interceptor);

        proxyLogger.debug('Executing request interceptors', { count: requestInterceptors.length });
        proxyLogger.debug('Headers before interceptors', { headers: requestContext.headers });

        await executeRequestInterceptors(requestContext, requestInterceptors);

        proxyLogger.debug('Headers after interceptors', { headers: requestContext.headers });

        // Build SPFN API URL
        const apiUrl = getApiUrl(config);
        proxyLogger.debug('API base URL', { apiUrl });

        const queryString = Object.entries(query)
            .flatMap(([key, value]) =>
                Array.isArray(value) ? value.map((v) => `${key}=${v}`) : [`${key}=${value}`]
            )
            .join('&');
        const url = `${apiUrl}${path}${queryString ? `?${queryString}` : ''}`;

        proxyLogger.debug('Full URL to fetch', { url });

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
            proxyLogger.debug('Calling API', { url, headers: requestContext.headers });
        }

        // Log fetch details before calling
        proxyLogger.debug('Fetch details', {
            url,
            method: init.method,
            headers: init.headers,
            hasBody: !!init.body,
            bodyType: init.body ? typeof init.body : 'none',
            bodySize: init.body instanceof FormData ? 'FormData' :
                     typeof init.body === 'string' ? init.body.length :
                     'unknown'
        });

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

        proxyLogger.debug('Response interceptors', { count: responseInterceptors.length });

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

        proxyLogger.debug('Response completed', { status: responseContext.response.status });

        return nextResponse;
    }
    catch (error)
    {
        // Extract detailed error information
        const errorContext: Record<string, unknown> = {
            type: error?.constructor?.name || 'Unknown',
        };

        if (error instanceof Error)
        {
            // Log error cause if available (useful for fetch errors)
            if ((error as any).cause)
            {
                errorContext.cause = {
                    message: (error as any).cause.message,
                    code: (error as any).cause.code,
                    errno: (error as any).cause.errno,
                    syscall: (error as any).cause.syscall,
                    address: (error as any).cause.address,
                    port: (error as any).cause.port,
                };
            }

            // For TypeError: fetch failed, log additional context
            if (error.message?.includes('fetch failed'))
            {
                try
                {
                    const apiUrl = getApiUrl(config);
                    errorContext.attemptedUrl = apiUrl;
                    errorContext.envVars = {
                        SERVER_API_URL: process.env.SERVER_API_URL,
                        SPFN_API_URL: process.env.SPFN_API_URL,
                    };
                }
                catch (e)
                {
                    // Ignore error while logging error
                }
            }

            proxyLogger.error('Proxy error', error, errorContext);
        }
        else
        {
            proxyLogger.error('Proxy error (non-Error type)', errorContext);
        }

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

    proxyLogger.debug('Creating proxy with config', {
        autoDiscoverInterceptors: finalConfig.autoDiscoverInterceptors,
        customInterceptors: finalConfig.interceptors?.length || 0,
        disableAutoInterceptors: finalConfig.disableAutoInterceptors || [],
    });

    // Auto-discover interceptors from registry
    if (finalConfig.autoDiscoverInterceptors)
    {
        const registeredPackages = interceptorRegistry.getPackageNames();
        proxyLogger.debug('Registered packages in registry', { packages: registeredPackages });

        const autoInterceptors = interceptorRegistry.getAll(
            finalConfig.disableAutoInterceptors || []
        );
        allInterceptors.push(...autoInterceptors);

        proxyLogger.debug('Auto-discovered interceptors from packages', {
            packages: registeredPackages,
            count: autoInterceptors.length
        });
    }

    // Add custom interceptors
    if (finalConfig.interceptors)
    {
        allInterceptors.push(...finalConfig.interceptors);
        proxyLogger.debug('Custom interceptors added', { count: finalConfig.interceptors.length });
    }

    // Create final config with merged interceptors
    const proxyConfig: ProxyConfig = {
        ...finalConfig,
        interceptors: allInterceptors,
    };

    proxyLogger.debug('Total interceptors loaded', { count: allInterceptors.length });

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
        proxyLogger.debug('Initializing default proxy with auto-discovery');
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