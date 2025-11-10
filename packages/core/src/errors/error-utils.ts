/**
 * Error Utility Functions
 *
 * Generic error type checking utilities
 */

import { DatabaseError } from './database-errors';
import { HttpError } from './http-errors';

/**
 * Check if error is a DatabaseError
 */
export function isDatabaseError(error: unknown): error is DatabaseError
{
    return error instanceof DatabaseError;
}

/**
 * Check if error is an HttpError
 */
export function isHttpError(error: unknown): error is HttpError
{
    return error instanceof HttpError;
}

/**
 * Check if error has a statusCode property
 */
export function hasStatusCode(error: unknown): error is { statusCode: number }
{
    return (
        typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        typeof (error as any).statusCode === 'number'
    );
}
