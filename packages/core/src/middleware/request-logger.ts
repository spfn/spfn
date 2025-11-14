/**
 * Request Logger Middleware
 *
 * Automatic API request/response logging with performance monitoring
 */
import { randomBytes } from 'crypto';
import type { Context, Next } from 'hono';
import { logger } from '../logger';

export interface RequestLoggerConfig
{
    /**
     * Paths to exclude from logging (health checks, etc.)
     */
    excludePaths?: string[];

    /**
     * Field names to mask for sensitive data
     */
    sensitiveFields?: string[];

    /**
     * Slow request threshold (ms)
     */
    slowRequestThreshold?: number;
}

const DEFAULT_CONFIG: Required<RequestLoggerConfig> = {
    excludePaths: ['/health', '/ping', '/favicon.ico'],
    sensitiveFields: ['password', 'token', 'apiKey', 'secret', 'authorization'],
    slowRequestThreshold: 1000,
};

/**
 * Generate cryptographically secure request ID
 */
function generateRequestId(): string
{
    const timestamp = Date.now();
    const randomPart = randomBytes(6).toString('hex');
    return `req_${timestamp}_${randomPart}`;
}

/**
 * Mask sensitive data with circular reference handling
 */
export function maskSensitiveData(
    obj: any,
    sensitiveFields: string[],
    seen = new WeakSet()
): any
{
    if (!obj || typeof obj !== 'object') return obj;

    if (seen.has(obj)) return '[Circular]';
    seen.add(obj);

    const lowerFields = sensitiveFields.map(f => f.toLowerCase());
    const masked = Array.isArray(obj) ? [...obj] : { ...obj };

    for (const key in masked)
    {
        const lowerKey = key.toLowerCase();

        if (lowerFields.some(field => lowerKey.includes(field)))
        {
            masked[key] = '***MASKED***';
        }
        else if (typeof masked[key] === 'object' && masked[key] !== null)
        {
            masked[key] = maskSensitiveData(masked[key], sensitiveFields, seen);
        }
    }

    return masked;
}

/**
 * Request Logger middleware
 */
export function RequestLogger(config?: RequestLoggerConfig)
{
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const apiLogger = logger.child('@spfn/core:api');

    return async (c: Context, next: Next) =>
    {
        const path = new URL(c.req.url).pathname;

        if (cfg.excludePaths.includes(path))
        {
            return next();
        }

        const requestId = generateRequestId();
        c.set('requestId', requestId);

        const method = c.req.method;
        const userAgent = c.req.header('user-agent');
        const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';

        const startTime = Date.now();

        apiLogger.info('Request received', {
            requestId,
            method,
            path,
            ip,
            userAgent,
        });

        try
        {
            await next();

            const duration = Date.now() - startTime;
            const status = c.res.status;

            const logData: Record<string, any> = {
                requestId,
                method,
                path,
                status,
                duration,
            };

            const isSlowRequest = duration >= cfg.slowRequestThreshold;
            if (isSlowRequest)
            {
                logData.slow = true;
            }

            // Add detailed error information for 4xx/5xx responses
            if (status >= 400)
            {
                try
                {
                    // Clone response to read body without consuming it
                    logData.response = await c.res.clone().json();
                }
                catch
                {
                    // Response is not JSON or already consumed - ignore
                }

                // Add request body for POST/PUT/PATCH to see what data caused the error
                if (['POST', 'PUT', 'PATCH'].includes(method))
                {
                    try
                    {
                        // Try to get the already parsed body from context
                        const requestBody = await c.req.json();
                        logData.request = maskSensitiveData(requestBody, cfg.sensitiveFields);
                    }
                    catch
                    {
                        // Body is not JSON or already consumed - ignore
                    }
                }
            }

            const logLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
            apiLogger[logLevel]('Request completed', logData);
        }
        catch (error)
        {
            const duration = Date.now() - startTime;

            apiLogger.error('Request failed', error as Error, {
                requestId,
                method,
                path,
                duration,
            });

            throw error;
        }
    };
}