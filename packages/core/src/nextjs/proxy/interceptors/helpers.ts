/**
 * SPFN Next.js Proxy Interceptor Execution Engine
 */

import type {
    InterceptorRule,
    RequestInterceptor,
    ResponseInterceptor,
    RequestInterceptorContext,
    ResponseInterceptorContext,
} from './types';

/**
 * Check if path matches pattern
 *
 * Supports:
 * - Wildcards: '/_auth/*' matches '/_auth/login'
 * - Path params: '/users/:id' matches '/users/123'
 * - RegExp: /^\/_auth\/.+$/ matches '/_auth/login'
 * - Exact match: '/_auth/login' matches '/_auth/login'
 * - All: '*' matches any path
 *
 * @param path - Request path to test
 * @param pattern - Pattern to match against
 * @returns True if path matches pattern
 */
export function matchPath(path: string, pattern: string | RegExp): boolean
{
    // Match all
    if (pattern === '*')
    {
        return true;
    }

    // RegExp pattern
    if (pattern instanceof RegExp)
    {
        return pattern.test(path);
    }

    // String pattern
    // Convert wildcard pattern to RegExp
    // '/_auth/*' -> /^\/_auth\/.*/
    // '/users/:id' -> /^\/users\/[^/]+$/
    const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/:[^/]+/g, '[^/]+')
        .replace(/\//g, '\\/');

    const regex = new RegExp(`^${regexPattern}$`);

    return regex.test(path);
}

/**
 * Check if method matches pattern
 *
 * @param method - Request method (e.g., 'POST')
 * @param pattern - Method pattern (e.g., 'POST' or ['POST', 'PUT'])
 * @returns True if method matches pattern
 */
export function matchMethod(
    method: string,
    pattern?: string | string[],
): boolean
{
    // No method filter = match all
    if (!pattern)
    {
        return true;
    }

    // Single method
    if (typeof pattern === 'string')
    {
        return method.toUpperCase() === pattern.toUpperCase();
    }

    // Multiple methods
    return pattern.some((m) => m.toUpperCase() === method.toUpperCase());
}

/**
 * Filter interceptors that match the request
 *
 * @param rules - All interceptor rules
 * @param path - Request path
 * @param method - Request method
 * @returns Matched interceptors
 */
export function filterMatchingInterceptors(
    rules: InterceptorRule[],
    path: string,
    method: string,
): InterceptorRule[]
{
    return rules.filter((rule) => 
    {
        return matchPath(path, rule.pathPattern) && matchMethod(method, rule.method);
    });
}

/**
 * Execute request interceptors in chain
 *
 * Interceptors are executed in order:
 * 1. First registered interceptor
 * 2. Second registered interceptor
 * 3. ... and so on
 *
 * Each interceptor must call next() to continue the chain.
 * If next() is not called, the chain stops and remaining interceptors are skipped.
 *
 * @param context - Request interceptor context
 * @param interceptors - Interceptors to execute
 */
export async function executeRequestInterceptors(
    context: RequestInterceptorContext,
    interceptors: RequestInterceptor[],
): Promise<void>
{
    let index = 0;

    const next = async (): Promise<void> => 
    {
        if (index >= interceptors.length)
        {
            return;
        }

        const interceptor = interceptors[index];
        index++;

        await interceptor(context, next);
    };

    await next();
}

/**
 * Execute response interceptors in chain
 *
 * Interceptors are executed in order:
 * 1. First registered interceptor
 * 2. Second registered interceptor
 * 3. ... and so on
 *
 * Each interceptor must call next() to continue the chain.
 * If next() is not called, the chain stops and remaining interceptors are skipped.
 *
 * @param context - Response interceptor context
 * @param interceptors - Interceptors to execute
 */
export async function executeResponseInterceptors(
    context: ResponseInterceptorContext,
    interceptors: ResponseInterceptor[],
): Promise<void>
{
    let index = 0;

    const next = async (): Promise<void> => 
    {
        if (index >= interceptors.length)
        {
            return;
        }

        const interceptor = interceptors[index];
        index++;

        await interceptor(context, next);
    };

    await next();
}
