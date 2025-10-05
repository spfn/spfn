/**
 * Error Handler Middleware
 *
 * Middleware that converts custom errors to HTTP responses
 *
 * ✅ Features:
 * - Convert DatabaseError family to appropriate HTTP status codes
 * - Error logging (log level by status code)
 * - Environment-specific error response format (Production/Development)
 * - Stack trace inclusion (development only)
 */
import type { Context } from 'hono';
import { isDatabaseError, type DatabaseError } from '../errors';
import { logger } from '../logger';

const errorLogger = logger.child('error-handler');

/**
 * Error handler options
 */
export interface ErrorHandlerOptions {
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
interface ErrorResponse {
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
 * app.onError(errorHandler());
 * ```
 */
export function errorHandler(options: ErrorHandlerOptions = {}) {
  const {
    includeStack = process.env.NODE_ENV !== 'production',
    enableLogging = true,
  } = options;

  return (err: Error, c: Context) => {
    // Handle DatabaseError
    if (isDatabaseError(err)) {
      const dbError = err as DatabaseError;
      const statusCode = dbError.statusCode;

      if (enableLogging) {
        // 4xx: warn, 5xx: error
        if (statusCode >= 500) {
          errorLogger.error('Database error occurred', {
            type: dbError.name,
            message: dbError.message,
            statusCode,
            path: c.req.path,
            method: c.req.method,
          });
        } else {
          errorLogger.warn('Client error occurred', {
            type: dbError.name,
            message: dbError.message,
            statusCode,
            path: c.req.path,
            method: c.req.method,
          });
        }
      }

      const response: ErrorResponse = {
        error: {
          message: dbError.message,
          type: dbError.name,
          statusCode,
        },
      };

      if (includeStack) {
        response.error.stack = dbError.stack;
      }

      return c.json(response, statusCode as any);
    }

    // Handle general errors
    if (enableLogging) {
      errorLogger.error('Unhandled error occurred', {
        message: err.message,
        stack: err.stack,
        path: c.req.path,
        method: c.req.method,
      });
    }

    const response: ErrorResponse = {
      error: {
        message: err.message || 'Internal Server Error',
        type: err.name || 'Error',
        statusCode: 500,
      },
    };

    if (includeStack) {
      response.error.stack = err.stack;
    }

    return c.json(response, 500);
  };
}