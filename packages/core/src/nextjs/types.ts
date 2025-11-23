/**
 * SPFN Next.js Proxy Interceptor Types
 */

import type { NextRequest } from 'next/server';

/**
 * Cookie options for setCookie
 */
export interface CookieOptions
{
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    maxAge?: number;
    path?: string;
    domain?: string;
}

/**
 * Cookie to set in response
 */
export interface SetCookie
{
    name: string;
    value: string;
    options?: CookieOptions;
}

/**
 * Request Interceptor Context
 *
 * Available before calling SPFN API
 */
export interface RequestInterceptorContext
{
    /**
     * Request path (e.g., '/_auth/login')
     */
    path: string;

    /**
     * HTTP method (e.g., 'POST')
     */
    method: string;

    /**
     * Request headers (mutable)
     */
    headers: Record<string, string>;

    /**
     * Request body (mutable)
     */
    body?: any;

    /**
     * Query parameters from original request
     */
    query: Record<string, string | string[]>;

    /**
     * Cookies from Next.js request
     */
    cookies: Map<string, string>;

    /**
     * Original Next.js request
     */
    request: NextRequest;

    /**
     * Metadata for sharing data between interceptors
     */
    metadata: Record<string, any>;
}

/**
 * Response Interceptor Context
 *
 * Available after SPFN API responds
 */
export interface ResponseInterceptorContext
{
    /**
     * Request path
     */
    path: string;

    /**
     * HTTP method
     */
    method: string;

    /**
     * Original request data (immutable)
     */
    request: {
        headers: Record<string, string>;
        body?: any;
    };

    /**
     * Response data (mutable)
     */
    response: {
        status: number;
        statusText: string;
        headers: Headers;
        body: any;
    };

    /**
     * Cookies to set in response
     *
     * @example
     * ```typescript
     * ctx.setCookies.push({
     *   name: 'session',
     *   value: 'xxx',
     *   options: { httpOnly: true, maxAge: 3600 }
     * });
     * ```
     */
    setCookies: SetCookie[];

    /**
     * Metadata shared from request interceptors
     */
    metadata: Record<string, any>;
}

/**
 * Request Interceptor Function
 *
 * @param context - Request context (mutable)
 * @param next - Call to continue to next interceptor
 *
 * @example
 * ```typescript
 * const interceptor: RequestInterceptor = async (ctx, next) => {
 *   // Modify headers
 *   ctx.headers['Authorization'] = 'Bearer token';
 *
 *   // Store data for response interceptor
 *   ctx.metadata.userId = '123';
 *
 *   // Continue to next interceptor
 *   await next();
 * };
 * ```
 */
export type RequestInterceptor = (
    context: RequestInterceptorContext,
    next: () => Promise<void>
) => Promise<void>;

/**
 * Response Interceptor Function
 *
 * @param context - Response context (mutable)
 * @param next - Call to continue to next interceptor
 *
 * @example
 * ```typescript
 * const interceptor: ResponseInterceptor = async (ctx, next) => {
 *   // Modify response body
 *   ctx.response.body = { ...ctx.response.body, extra: 'data' };
 *
 *   // Set cookie
 *   ctx.setCookies.push({
 *     name: 'session',
 *     value: 'xxx',
 *     options: { httpOnly: true }
 *   });
 *
 *   // Continue to next interceptor
 *   await next();
 * };
 * ```
 */
export type ResponseInterceptor = (
    context: ResponseInterceptorContext,
    next: () => Promise<void>
) => Promise<void>;

/**
 * Interceptor Rule
 *
 * Defines when and how to intercept requests/responses
 */
export interface InterceptorRule
{
    /**
     * Path pattern to match
     *
     * - String with wildcards: '/_auth/*', '/users/:id'
     * - RegExp: /^\/_auth\/.+$/
     * - '*' matches all paths
     *
     * @example
     * ```typescript
     * pathPattern: '/_auth/*'      // matches /_auth/login, /_auth/register
     * pathPattern: '/users/:id'    // matches /users/123, /users/456
     * pathPattern: /^\/_auth\/.+$/ // regex match
     * pathPattern: '*'             // matches all paths
     * ```
     */
    pathPattern: string | RegExp;

    /**
     * HTTP method(s) to match (optional)
     *
     * - Single method: 'POST'
     * - Multiple methods: ['POST', 'PUT']
     * - Omit to match all methods
     *
     * @default undefined (matches all methods)
     */
    method?: string | string[];

    /**
     * Request interceptor
     *
     * Called before SPFN API request
     */
    request?: RequestInterceptor;

    /**
     * Response interceptor
     *
     * Called after SPFN API response
     */
    response?: ResponseInterceptor;
}

/**
 * Proxy Configuration
 */
export interface ProxyConfig
{
    /**
     * SPFN API base URL
     *
     * @default process.env.SERVER_API_URL || process.env.SPFN_API_URL || 'http://localhost:8790'
     */
    apiUrl?: string;

    /**
     * Additional custom interceptors
     *
     * These are executed after auto-discovered interceptors
     *
     * Executed in order: first registered -> last registered
     */
    interceptors?: InterceptorRule[];

    /**
     * Enable automatic interceptor discovery from registry
     *
     * When enabled, all interceptors registered via registerInterceptors()
     * are automatically applied to the proxy.
     *
     * @default true
     */
    autoDiscoverInterceptors?: boolean;

    /**
     * Disable interceptors from specific packages
     *
     * Use this to exclude auto-discovered interceptors from certain packages
     * when you want to provide custom implementations.
     *
     * @example ['auth', 'storage']
     */
    disableAutoInterceptors?: string[];

    /**
     * Enable debug logging
     *
     * @default false
     */
    debug?: boolean;
}