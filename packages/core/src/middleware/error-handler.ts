/**
 * Error Handler Middleware
 *
 * Generic middleware that converts errors with statusCode to HTTP responses
 */
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { logger } from '../logger';
import type { ErrorResponse, ErrorCause } from '../route/types';

const errorLogger = logger.child('@spfn/core:error-handler');

export interface ErrorHandlerOptions
{
    /**
     * Include stack trace in response
     * @default process.env.NODE_ENV !== 'production'
     */
    includeStack?: boolean;

    /**
     * Include error cause chain in response
     * @default process.env.NODE_ENV !== 'production'
     */
    includeCauses?: boolean;

    /**
     * Include sensitive database info (table, column, schema, constraint)
     * in logs and responses
     * @default false
     */
    includeSensitiveInfo?: boolean;

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
 * Remove sensitive database information from error cause
 *
 * Filters out database schema information (table, column, schema, constraint)
 * to prevent information leakage in production environments.
 */
function sanitizeErrorCause(
    cause: ErrorCause,
    includeSensitiveInfo: boolean
): ErrorCause
{
    if (includeSensitiveInfo)
    {
        return cause;
    }

    // Remove sensitive database information
    const { constraint, table, column, schema, ...safeCause } = cause;
    return safeCause;
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
        includeCauses = process.env.NODE_ENV !== 'production',
        includeSensitiveInfo = false,
        enableLogging = true,
    } = options;

    return (err: Error, c: Context) =>
    {
        const errorWithCode = err as ErrorWithStatusCode;
        const statusCode = errorWithCode.statusCode || 500;
        const errorType = err.name || 'Error';

        // Extract error cause chain
        const causes = extractErrorCauses(err, includeStack);

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

            // Include error cause chain with sensitive info filtering
            if (causes.length > 0)
            {
                logData.causes = includeSensitiveInfo
                    ? causes
                    : causes.map(c => sanitizeErrorCause(c, false));
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
                timestamp: new Date().toISOString(),
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

        // Include error cause chain in response with sensitive info filtering
        if (includeCauses && causes.length > 0)
        {
            response.error.causes = causes.map(c =>
                sanitizeErrorCause(c, includeSensitiveInfo)
            );
        }

        return c.json(response, statusCode as ContentfulStatusCode);
    };
}
