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
export class DatabaseError<TDetails extends Record<string, unknown> = Record<string, unknown>> extends Error
{
    public readonly statusCode: number;
    public readonly details?: TDetails;

    constructor(
        message: string,
        statusCode: number = 500,
        details?: TDetails
    )
    {
        super(message);
        this.name = 'DatabaseError';
        this.statusCode = statusCode;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
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
 * Entity Not Found Error (404 Not Found)
 *
 * Database entity does not exist
 */
export class EntityNotFoundError extends QueryError
{
    constructor(resource: string, id: string | number)
    {
        super(`${resource} with id ${id} not found`, 404, { resource, id });
        this.name = 'NotFoundError';
    }
}

/**
 * Constraint Violation Error (400 Bad Request)
 *
 * Database constraint violation (NOT NULL, CHECK, FOREIGN KEY, etc.)
 * This is different from HTTP ValidationError which validates request input
 */
export class ConstraintViolationError extends QueryError
{
    constructor(message: string, details?: Record<string, any>)
    {
        super(message, 400, details);
        this.name = 'ConstraintViolationError';
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