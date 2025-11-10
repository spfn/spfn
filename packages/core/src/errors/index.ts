/**
 * Error Module Exports
 *
 * Entry point for error handling module (Pure re-export only)
 */

// Database Error Classes
export {
    DatabaseError,
    ConnectionError,
    QueryError,
    EntityNotFoundError,
    ConstraintViolationError,
    TransactionError,
    DeadlockError,
    DuplicateEntryError,
} from './database-errors';

// HTTP Error Classes
export {
    HttpError,
    BadRequestError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    TooManyRequestsError,
    UnprocessableEntityError,
    InternalServerError,
    ServiceUnavailableError,
} from './http-errors';

// Error Utilities
export {
    isDatabaseError,
    isHttpError,
    hasStatusCode,
} from './error-utils';
