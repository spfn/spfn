import type { Logger } from '@spfn/core/logger';
import { ApiError } from './errors';
import * as debugLogs from './debug-logs';

/**
 * Build URL with path parameters replaced
 *
 * @example
 * buildUrlWithParams('/users/:id/posts/:postId', { id: '123', postId: '456' })
 * // Returns: '/users/123/posts/456'
 */
export function buildUrlWithParams(path: string, params: Record<string, any>): string
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
 *
 * @example
 * buildQueryString({ page: '1', limit: '10', tags: ['foo', 'bar'] })
 * // Returns: '?page=1&limit=10&tags=foo&tags=bar'
 */
export function buildQueryString(query: Record<string, any>): string
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

/**
 * Build Cookie header string from cookies object
 *
 * @example
 * buildCookieHeader({ session: 'abc123', theme: 'dark' })
 * // Returns: 'session=abc123; theme=dark'
 */
export function buildCookieHeader(cookies: Record<string, string>): string
{
    return Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
}

/**
 * Parse response body based on content type
 */
export async function parseResponseBody(response: Response): Promise<any>
{
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json'))
    {
        const text = await response.text();
        return text ? JSON.parse(text) : null;
    }
    else
    {
        return await response.text();
    }
}

/**
 * Auto-detect cookies from Next.js server environment
 * Returns empty object if not in server environment or if cookies are not accessible
 */
export async function autoDetectServerCookies(): Promise<Record<string, string>>
{
    try
    {
        // Next.js cookies() API is only available in server environment
        const { cookies } = await import('next/headers');
        const cookieStore = await cookies();
        const allCookies = cookieStore.getAll();

        return Object.fromEntries(
            allCookies.map(cookie => [cookie.name, cookie.value])
        );
    }
    catch (error)
    {
        // Client environment or cookies not accessible
        // Browser automatically sends cookies in client components
        return {};
    }
}

/**
 * Prepare RequestInit object with headers, body, and cookies
 * Returns both the init object and auto-detected cookies for logging
 */
export async function prepareRequestInit(
    method: string,
    inputBody: any,
    defaultHeaders: Record<string, string>,
    optionHeaders?: Record<string, string>,
    optionCookies?: Record<string, string>,
    fetchOptions?: RequestInit
): Promise<{ init: RequestInit; autoDetectedCookies: Record<string, string> }>
{
    // Build request init
    const init: RequestInit = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...defaultHeaders,
            ...optionHeaders,
        },
        ...fetchOptions,
    };

    // Add body for mutations
    if (['POST', 'PUT', 'PATCH'].includes(method) && inputBody)
    {
        init.body = JSON.stringify(inputBody);
    }

    // Auto-detect server cookies and merge with user-provided cookies
    const autoDetectedCookies = await autoDetectServerCookies();
    const cookiesToSend = {
        ...autoDetectedCookies,
        ...(optionCookies || {}),
    };

    // Add Cookie header if we have cookies to send
    if (Object.keys(cookiesToSend).length > 0)
    {
        (init.headers as Record<string, string>)['Cookie'] = buildCookieHeader(cookiesToSend);
    }

    return { init, autoDetectedCookies };
}

/**
 * Execute fetch with timeout and abort controller
 */
export async function executeFetchWithTimeout(
    url: string,
    init: RequestInit,
    timeout: number,
    customFetch: typeof fetch = fetch
): Promise<Response>
{
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try
    {
        const response = await customFetch(url, {
            ...init,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response;
    }
    catch (error)
    {
        clearTimeout(timeoutId);
        throw error;
    }
}

/**
 * Handle error response with deserialization support
 * Attempts to deserialize custom errors if errorRegistry is provided
 * Falls back to ApiError if deserialization fails or is not available
 */
export async function handleErrorResponse(
    response: Response,
    body: any,
    fullUrl: string,
    errorRegistry: any,
    debug: boolean,
    logger: Logger
): Promise<never>
{
    if (debug)
    {
        debugLogs.logErrorResponse(logger, response.status, body);
    }

    // Try to deserialize error if registry is provided
    let deserializedError: Error | null = null;

    if (errorRegistry && body && typeof body === 'object' && '__type' in body)
    {
        if (debug)
        {
            debugLogs.logErrorDeserializationAttempt(logger, body.__type, errorRegistry.getRegisteredTypes());
        }

        try
        {
            deserializedError = errorRegistry.deserialize(body as any);

            if (debug)
            {
                debugLogs.logErrorDeserializationSuccess(logger, deserializedError);
            }
        }
        catch (deserializeError)
        {
            // Deserialization itself failed (type not found, invalid data, etc.)
            if (debug)
            {
                debugLogs.logErrorDeserializationFailure(logger, deserializeError);
            }
            // Fall through to ApiError below
        }
    }
    else if (debug)
    {
        debugLogs.logErrorDeserializationSkipped(logger, errorRegistry, body);
    }

    // If deserialization succeeded, throw the deserialized error
    if (deserializedError)
    {
        if (debug)
        {
            debugLogs.logThrowingDeserializedError(logger, deserializedError);
        }

        throw deserializedError;
    }

    // Fallback to generic ApiError
    if (response.status === 404 && process.env.NODE_ENV !== 'production')
    {
        logger.warn(
            '\n⚠️  404 Not Found\n\n' +
            'Check if routes are registered in server.config.ts:\n' +
            '  → defineServerConfig().routes(appRouter)\n'
        );
    }

    throw new ApiError(
        body?.message || `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        fullUrl,
        body,
        'http'
    );
}