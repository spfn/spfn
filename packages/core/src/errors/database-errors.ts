/**
 * Database Error Classes
 *
 * Type-safe error handling with custom error class hierarchy
 * Mapped to HTTP status codes for API responses
 */

/**
 * Base Database Error
 *
 * Base class for all database-related errors
 */
export class DatabaseError extends Error
{
    public readonly statusCode: number;
    public readonly details?: Record<string, any>;
    public readonly timestamp: Date;

    constructor(
        message: string,
        statusCode: number = 500,
        details?: Record<string, any>
    )
    {
        super(message);
        this.name = 'DatabaseError';
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
            name: this.name,
            message: this.message,
            statusCode: this.statusCode,
            details: this.details,
            timestamp: this.timestamp.toISOString()
        };
    }
}

/**
 * Connection Error (503 Service Unavailable)
 *
 * Database connection failure, connection pool exhaustion, etc.
 */
export class ConnectionError extends DatabaseError
{
    constructor(message: string, details?: Record<string, any>)
    {
        super(message, 503, details);
        this.name = 'ConnectionError';
    }
}

/**
 * Query Error (500 Internal Server Error)
 *
 * SQL query execution failure, syntax errors, etc.
 */
export class QueryError extends DatabaseError
{
    constructor(message: string, statusCode: number = 500, details?: Record<string, any>)
    {
        super(message, statusCode, details);
        this.name = 'QueryError';
    }
}

/**
 * Not Found Error (404 Not Found)
 *
 * Requested resource does not exist
 */
export class NotFoundError extends QueryError
{
    constructor(resource: string, id: string | number)
    {
        super(`${resource} with id ${id} not found`, 404, { resource, id });
        this.name = 'NotFoundError';
    }
}

/**
 * Validation Error (400 Bad Request)
 *
 * Input data validation failure
 */
export class ValidationError extends QueryError
{
    constructor(message: string, details?: Record<string, any>)
    {
        super(message, 400, details);
        this.name = 'ValidationError';
    }
}

/**
 * Transaction Error (500 Internal Server Error)
 *
 * Transaction start/commit/rollback failure
 */
export class TransactionError extends DatabaseError
{
    constructor(message: string, statusCode: number = 500, details?: Record<string, any>)
    {
        super(message, statusCode, details);
        this.name = 'TransactionError';
    }
}

/**
 * Deadlock Error (409 Conflict)
 *
 * Database deadlock detected
 */
export class DeadlockError extends TransactionError
{
    constructor(message: string, details?: Record<string, any>)
    {
        super(message, 409, details);
        this.name = 'DeadlockError';
    }
}

/**
 * Duplicate Entry Error (409 Conflict)
 *
 * Unique constraint violation (e.g., duplicate email)
 */
export class DuplicateEntryError extends QueryError
{
    constructor(field: string, value: string | number)
    {
        super(`${field} '${value}' already exists`, 409, { field, value });
        this.name = 'DuplicateEntryError';
    }
}