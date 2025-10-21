/**
 * Error Handler Middleware
 *
 * Generic middleware that converts errors with statusCode to HTTP responses
 */
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { logger } from '../logger';

const errorLogger = logger.child('error-handler');

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

interface ErrorWithStatusCode extends Error
{
    statusCode?: number;
    details?: any;
}

interface ErrorResponse
{
    error: {
        message: string;
        type: string;
        statusCode: number;
        stack?: string;
        details?: any;
    };
}

/**
 * Error handler middleware
 *
 * Used in Hono's onError hook
 */
export function ErrorHandler(options: ErrorHandlerOptions = {}): (err: Error, c: Context) => Response | Promise<Response>
{
    const {
        includeStack = process.env.NODE_ENV !== 'production',
        enableLogging = true,
    } = options;

    return (err: Error, c: Context) =>
    {
        const errorWithCode = err as ErrorWithStatusCode;
        const statusCode = errorWithCode.statusCode || 500;
        const errorType = err.name || 'Error';

        if (enableLogging)
        {
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

        if (errorWithCode.details)
        {
            response.error.details = errorWithCode.details;
        }

        if (includeStack)
        {
            response.error.stack = err.stack;
        }

        return c.json(response, statusCode as ContentfulStatusCode);
    };
}
