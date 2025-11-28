/**
 * CMS Error Classes
 *
 * Type-safe error handling with custom error class hierarchy
 * Mapped to HTTP status codes for API responses
 */

/**
 * Base CMS Error
 *
 * Base class for all CMS-related errors
 */
export class CMSError<TDetails extends Record<string, unknown> = Record<string, unknown>> extends Error
{
    public readonly statusCode: number;
    public readonly details?: TDetails;
    public readonly timestamp: Date;

    constructor(
        message: string,
        statusCode: number = 500,
        details?: TDetails
    )
    {
        super(message);
        this.name = 'CMSError';
        this.statusCode = statusCode;
        this.details = details;
        this.timestamp = new Date();
        Error.captureStackTrace(this, this.constructor);
    }

    /**
     * Serialize error for API response
     */
    toJSON()
    {
        return {
            error: this.message,
            name: this.name,
            statusCode: this.statusCode,
            details: this.details,
            timestamp: this.timestamp.toISOString()
        };
    }
}

/**
 * Invalid Request Error (400 Bad Request)
 *
 * Invalid input parameters, malformed data, etc.
 */
export class CMSInvalidRequestError extends CMSError
{
    constructor(message: string, details?: Record<string, any>)
    {
        super(message, 400, details);
        this.name = 'CMSInvalidRequestError';
    }
}

/**
 * Resource Not Found Error (404 Not Found)
 *
 * CMS resource does not exist (label, value, etc.)
 */
export class CMSNotFoundError extends CMSError
{
    constructor(resource: string, identifier: string | number | Record<string, any>)
    {
        const details = typeof identifier === 'object'
            ? { resource, ...identifier }
            : { resource, id: identifier };
        super(`${resource} not found`, 404, details);
        this.name = 'CMSNotFoundError';
    }
}

/**
 * Operation Failed Error (500 Internal Server Error)
 *
 * CMS operation failure (create, update, delete, etc.)
 */
export class CMSOperationError extends CMSError
{
    constructor(operation: string, resource: string, details?: Record<string, any>)
    {
        super(`Failed to ${operation} ${resource}`, 500, { operation, resource, ...details });
        this.name = 'CMSOperationError';
    }
}

/**
 * Conflict Error (409 Conflict)
 *
 * Resource already exists or state conflict
 */
export class CMSConflictError extends CMSError
{
    constructor(message: string, details?: Record<string, any>)
    {
        super(message, 409, details);
        this.name = 'CMSConflictError';
    }
}

/**
 * Forbidden Error (403 Forbidden)
 *
 * Insufficient permissions for the operation
 */
export class CMSForbiddenError extends CMSError
{
    constructor(message: string, details?: Record<string, any>)
    {
        super(message, 403, details);
        this.name = 'CMSForbiddenError';
    }
}