/**
 * Error Handler Middleware
 *
 * Generic middleware that converts errors with statusCode to HTTP responses
 */
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { logger } from '../logger';
import type { ErrorResponse } from '../route/types';

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

interface ErrorCause
{
    message: string;
    name?: string;
    code?: string;
    detail?: string;
    hint?: string;
    constraint?: string;
    table?: string;
    column?: string;
    schema?: string;
    stack?: string;
}

/**
 * Extract error cause chain recursively
 */
function extractErrorCauses(error: Error, includeStack: boolean): ErrorCause[]
{
    const causes: ErrorCause[] = [];
    let currentError: any = error.cause;

    while (currentError)
    {
        const cause: ErrorCause = {
            message: currentError.message || String(currentError),
            name: currentError.name,
        };

        // Extract PostgreSQL/Database specific error info
        if (currentError.code) cause.code = currentError.code;
        if (currentError.detail) cause.detail = currentError.detail;
        if (currentError.hint) cause.hint = currentError.hint;
        if (currentError.constraint) cause.constraint = currentError.constraint;
        if (currentError.table) cause.table = currentError.table;
        if (currentError.column) cause.column = currentError.column;
        if (currentError.schema) cause.schema = currentError.schema;

        if (includeStack && currentError.stack)
        {
            cause.stack = currentError.stack;
        }

        causes.push(cause);

        // Move to next cause in chain
        currentError = currentError.cause;
    }

    return causes;
}

/**
 * Standard error response format
 *
 * Re-exported from @spfn/core/types for convenience
 */
export type { ErrorResponse } from '../route/types';

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

            const logData: Record<string, any> = {
                type: errorType,
                message: err.message,
                statusCode,
                path: c.req.path,
                method: c.req.method,
            };

            // Include details if available
            if (errorWithCode.details)
            {
                logData.details = errorWithCode.details;
            }

            // Extract and include error cause chain
            const causes = extractErrorCauses(err, includeStack);
            if (causes.length > 0)
            {
                logData.causes = causes;
            }

            // Pass Error object directly to logger for proper stack trace formatting
            if (includeStack)
            {
                errorLogger[logLevel]('Error occurred', err, logData);
            }
            else
            {
                errorLogger[logLevel]('Error occurred', logData);
            }
        }

        const response: ErrorResponse = {
            success: false,
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
