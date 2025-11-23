/**
 * Error Handler Middleware
 *
 * Handles SerializableError with automatic serialization and standard errors
 */
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { SerializableError } from '../errors';
import { logger } from '../logger';
import { env } from '../config';

const errorLogger = logger.child('@spfn/core:error-handler');

export interface ErrorHandlerOptions
{
    /**
     * Include stack trace in response
     * @default env.NODE_ENV !== 'production'
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
    details?: Record<string, unknown>;
}

/**
 * Error handler middleware
 *
 * Used in Hono's onError hook
 */
export function ErrorHandler(options: ErrorHandlerOptions = {}): (err: Error, c: Context) => Response | Promise<Response>
{
    const {
        includeStack = env.NODE_ENV !== 'production',
        enableLogging = true,
    } = options;

    return (err: Error, c: Context) =>
    {
        // Handle SerializableError with automatic serialization
        // Use duck typing to handle module duplication issues in dev mode (tsx)
        const isSerializable = err instanceof SerializableError ||
                              (typeof (err as any).toJSON === 'function' &&
                               typeof (err as any).statusCode === 'number');

        if (isSerializable)
        {
            const statusCode = (err as any).statusCode;

            if (enableLogging)
            {
                const logLevel = statusCode >= 500 ? 'error' : 'warn';

                const logData: Record<string, any> = {
                    type: err.constructor.name,
                    message: err.message,
                    statusCode,
                    path: c.req.path,
                    method: c.req.method,
                };

                if (includeStack)
                {
                    errorLogger[logLevel]('Error occurred', err, logData);
                }
                else
                {
                    errorLogger[logLevel]('Error occurred', logData);
                }
            }

            // Use toJSON() for automatic serialization
            const serialized = (err as any).toJSON();

            // Add stack trace in development
            if (includeStack && err.stack)
            {
                serialized.stack = err.stack;
            }

            return c.json(serialized, statusCode as ContentfulStatusCode);
        }

        // Handle standard errors (fallback)
        const errorWithCode = err as ErrorWithStatusCode;
        const statusCode = errorWithCode.statusCode || 500;
        const errorType = err.name || 'Error';

        if (enableLogging)
        {
            const logLevel = statusCode >= 500 ? 'error' : 'warn';

            const logData: Record<string, any> = {
                type: errorType,
                message: err.message,
                statusCode,
                path: c.req.path,
                method: c.req.method,
            };

            if (includeStack)
            {
                errorLogger[logLevel]('Error occurred', err, logData);
            }
            else
            {
                errorLogger[logLevel]('Error occurred', logData);
            }
        }

        // Standard error response
        const response: Record<string, any> = {
            __type: 'Error',
            message: err.message || 'Internal Server Error',
        };

        if (includeStack && err.stack)
        {
            response.stack = err.stack;
        }

        return c.json(response, statusCode as ContentfulStatusCode);
    };
}
