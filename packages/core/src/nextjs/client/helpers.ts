import type { Logger } from '@spfn/core/logger';
import type { ErrorRegistry } from '@spfn/core/errors';
import { logger } from '@spfn/core/logger';
import { ApiError } from './errors';
import * as debugLogs from './debug-logs';

// Re-export shared utilities
export { buildCookieHeader, parseResponseBody } from '../shared';

const cookieLogger = logger.child('@spfn/core:auto-cookies');

/**
 * Auto-detect cookies from Next.js server environment
 * Returns empty object if not in server environment or if cookies are not accessible
 */
export async function autoDetectServerCookies(): Promise<Record<string, string>>
{
    // Client environment — browser sends cookies automatically
    if (typeof window !== 'undefined')
    {
        return {};
    }

    try
    {
        // Next.js cookies() API is only available in server environment
        const { cookies } = await import('next/headers');
        const cookieStore = await cookies();
        const allCookies = cookieStore.getAll();

        const result = Object.fromEntries(
            allCookies.map(cookie => [cookie.name, cookie.value])
        );

        cookieLogger.debug('Server cookies detected', {
            count: allCookies.length,
            names: allCookies.map(c => c.name),
        });

        return result;
    }
    catch (error)
    {
        // Server environment but cookies() not accessible
        // (e.g. static generation, build time, or outside request context)
        const err = error as Error;
        cookieLogger.warn('Failed to read server cookies', {
            message: err.message,
            name: err.name,
        });
        return {};
    }
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
    errorRegistry: ErrorRegistry | undefined,
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
            'Check the following:\n' +
            '  1. Routes are registered in server.config.ts:\n' +
            '     → defineServerConfig().routes(appRouter)\n' +
            '  2. Delete .spfn cache if you recently added new routes:\n' +
            '     → rm -rf .spfn\n'
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