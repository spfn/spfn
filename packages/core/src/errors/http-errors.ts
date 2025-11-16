/**
 * HTTP Error Classes
 *
 * Standard HTTP error classes for API responses
 * Covers common HTTP status codes beyond database errors
 */

/**
 * Base HTTP Error
 *
 * Base class for all HTTP-related errors
 */
export class HttpError<TDetails extends Record<string, unknown> = Record<string, unknown>> extends Error
{
    public readonly statusCode: number;
    public readonly details?: TDetails;

    constructor(
        message: string,
        statusCode: number,
        details?: TDetails
    )
    {
        super(message);
        this.name = 'HttpError';
        this.statusCode = statusCode;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Bad Request Error (400)
 *
 * Generic bad request - malformed syntax, invalid parameters, etc.
 */
export class BadRequestError extends HttpError
{
    constructor(message: string = 'Bad request', details?: Record<string, any>)
    {
        super(message, 400, details);
        this.name = 'BadRequestError';
    }
}

/**
 * Validation Error (400)
 *
 * Input validation failure (request params, query, body)
 * Used by contract-based routing for automatic validation
 */
export class ValidationError extends HttpError
{
    constructor(message: string, details?: Record<string, any>)
    {
        super(message, 400, details);
        this.name = 'ValidationError';
    }
}

/**
 * Unauthorized Error (401)
 *
 * Authentication required or authentication failed
 */
export class UnauthorizedError extends HttpError
{
    constructor(message: string = 'Authentication required', details?: Record<string, any>)
    {
        super(message, 401, details);
        this.name = 'UnauthorizedError';
    }
}

/**
 * Forbidden Error (403)
 *
 * Authenticated but lacks permission to access resource
 */
export class ForbiddenError extends HttpError
{
    constructor(message: string = 'Access forbidden', details?: Record<string, any>)
    {
        super(message, 403, details);
        this.name = 'ForbiddenError';
    }
}

/**
 * Not Found Error (404)
 *
 * Requested resource does not exist
 * Generic HTTP 404 error (for database-specific NotFoundError, see database-errors.ts)
 */
export class NotFoundError extends HttpError
{
    constructor(message: string = 'Resource not found', details?: Record<string, any>)
    {
        super(message, 404, details);
        this.name = 'NotFoundError';
    }
}

/**
 * Conflict Error (409)
 *
 * Generic conflict - resource state conflict, concurrent modification, etc.
 * More general than DuplicateEntryError
 */
export class ConflictError extends HttpError
{
    constructor(message: string = 'Resource conflict', details?: Record<string, any>)
    {
        super(message, 409, details);
        this.name = 'ConflictError';
    }
}

/**
 * Too Many Requests Error (429)
 *
 * Rate limit exceeded
 */
export class TooManyRequestsError extends HttpError
{
    constructor(
        message: string = 'Too many requests',
        retryAfter?: number,
        details?: Record<string, any>
    )
    {
        const fullDetails = retryAfter
            ? { ...details, retryAfter }
            : details;

        super(message, 429, fullDetails);
        this.name = 'TooManyRequestsError';
    }
}

/**
 * Internal Server Error (500)
 *
 * Generic server error when no specific error type applies
 */
export class InternalServerError extends HttpError
{
    constructor(message: string = 'Internal server error', details?: Record<string, any>)
    {
        super(message, 500, details);
        this.name = 'InternalServerError';
    }
}

/**
 * Unprocessable Entity Error (422)
 *
 * Request is well-formed but contains semantic errors
 */
export class UnprocessableEntityError extends HttpError
{
    constructor(message: string = 'Unprocessable entity', details?: Record<string, any>)
    {
        super(message, 422, details);
        this.name = 'UnprocessableEntityError';
    }
}

/**
 * Service Unavailable Error (503)
 *
 * Service temporarily unavailable (maintenance, overload, etc.)
 */
export class ServiceUnavailableError extends HttpError
{
    constructor(
        message: string = 'Service unavailable',
        retryAfter?: number,
        details?: Record<string, any>
    )
    {
        const fullDetails = retryAfter
            ? { ...details, retryAfter }
            : details;

        super(message, 503, fullDetails);
        this.name = 'ServiceUnavailableError';
    }
}