/**
 * Error Handler Middleware
 *
 * Generic middleware that converts errors with statusCode to HTTP responses
 *
 * ✅ Features:
 * - Convert any error with statusCode property to appropriate HTTP status codes
 * - Error logging (log level by status code)
 * - Environment-specific error response format (Production/Development)
 * - Stack trace inclusion (development only)
 * - Support for additional error details
 *
 * 💡 Design:
 * - Domain-independent (doesn't depend on specific error types)
 * - Works with any error that has a statusCode property
 * - Follows dependency inversion principle
 */
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { logger } from '../logger';

const errorLogger = logger.child('error-handler');

/**
 * Error handler options
 */
export interface ErrorHandlerOptions
{
    /**
     * Include stack trace in response
     * @default process.env.NODE_ENV !== 'production'
     */
    includeStack?: boolean;

    /**
     * Enable error logging
     * @default true
     */
    enableLogging?: boolean;
}

/**
 * Error response format
 */
interface ErrorResponse
{
    error: {
        message: string;
        type: string;
        statusCode: number;
        stack?: string;
    };
}

/**
 * Error handler middleware
 *
 * Used in Hono's onError hook
 *
 * @example
 * ```typescript
 * const app = new Hono();
 * app.onError(ErrorHandler());
 * ```
 */
export function ErrorHandler(options: ErrorHandlerOptions = {}): (err: Error, c: Context) => Response | Promise<Response>
{
    const {
        includeStack = process.env.NODE_ENV !== 'production',
        enableLogging = true,
    } = options;

    return (err: Error, c: Context) =>
    {
        // Generic error handling: check for statusCode property
        const statusCode = (err as any).statusCode || 500;
        const errorType = err.name || 'Error';

        if (enableLogging)
        {
            // 4xx: warn, 5xx: error
            const logLevel = statusCode >= 500 ? 'error' : 'warn';

            errorLogger[logLevel]('Error occurred', {
                type: errorType,
                message: err.message,
                statusCode,
                path: c.req.path,
                method: c.req.method,
            });
        }

        const response: ErrorResponse = {
            error: {
                message: err.message || 'Internal Server Error',
                type: errorType,
                statusCode,
            },
        };

        // Include additional error details if available
        if ((err as any).details)
        {
            (response.error as any).details = (err as any).details;
        }

        if (includeStack)
        {
            response.error.stack = err.stack;
        }

        return c.json(response, statusCode as ContentfulStatusCode);
    };
}