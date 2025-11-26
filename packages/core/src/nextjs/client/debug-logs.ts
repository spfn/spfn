/**
 * Debug logging utilities for API client
 * Separates debug logging logic from main client code for better maintainability
 */
import type { Logger } from '@spfn/core/logger';
import type { RouteMetadata } from '@spfn/core/route';

export function logApiInitialization(
    logger: Logger,
    baseUrl: string,
    totalRoutes: number
): void
{
    logger.debug('Superfunction API initialized', {
        baseUrl,
        totalRoutes,
    });
}

export function logRouteRegistration(
    logger: Logger,
    routeMetadata: Map<string, RouteMetadata>
): void
{
    for (const [name, metadata] of routeMetadata.entries())
    {
        logger.debug('Route registered', {
            name,
            method: metadata.method,
            path: metadata.path,
        });
    }
}

export function logCookieAutoDetection(
    logger: Logger,
    cookies: Array<{ name: string; value: string }>
): void
{
    logger.debug('Auto-detected server environment, forwarding cookies', {
        cookieCount: cookies.length,
        cookieNames: cookies.map(c => c.name),
    });
}

export function logRequest(
    logger: Logger,
    routeName: string,
    method: string,
    url: string,
    hasBody: boolean
): void
{
    logger.debug('→ Request', {
        route: routeName,
        method,
        url,
        hasBody,
    });
}

export function logResponse(
    logger: Logger,
    routeName: string,
    status: number,
    hasBody: boolean
): void
{
    logger.debug('← Response', {
        route: routeName,
        status,
        hasBody,
    });
}

export function logErrorResponse(
    logger: Logger,
    status: number,
    body: any
): void
{
    logger.debug('Error response received', {
        status,
        hasBody: !!body,
        bodyType: typeof body,
        hasTypeField: body && typeof body === 'object' && '__type' in body,
        typeValue: body?.__type,
    });
}

export function logErrorDeserializationAttempt(
    logger: Logger,
    errorType: string,
    registeredTypes: string[]
): void
{
    logger.debug('Attempting error deserialization', {
        errorType,
        hasRegistry: true,
        registeredTypes,
    });
}

export function logErrorDeserializationSuccess(
    logger: Logger,
    error: Error
): void
{
    logger.debug('Error deserialized successfully', {
        errorName: error?.name,
        errorConstructor: error?.constructor.name,
        message: error?.message,
    });
}

export function logErrorDeserializationFailure(
    logger: Logger,
    error: unknown
): void
{
    logger.debug('Deserialization failed', {
        errorName: error instanceof Error ? error.name : 'unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
    });
}

export function logErrorDeserializationSkipped(
    logger: Logger,
    errorRegistry: any,
    body: any
): void
{
    const reason = !errorRegistry
        ? 'no registry'
        : !body
            ? 'no body'
            : typeof body !== 'object'
                ? 'body not object'
                : !('__type' in body)
                    ? 'no __type field'
                    : 'unknown';

    logger.debug('Skipping error deserialization', { reason });
}

export function logThrowingDeserializedError(
    logger: Logger,
    error: Error
): void
{
    logger.debug('Throwing deserialized error', {
        errorName: error.name,
        errorConstructorName: error.constructor.name,
        prototype: Object.getPrototypeOf(error).constructor.name,
    });
}