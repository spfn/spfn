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
    NotFoundError,
    ConstraintViolationError,
    TransactionError,
    DeadlockError,
    DuplicateEntryError,
} from './database-errors.js';

// HTTP Error Classes
export {
    HttpError,
    BadRequestError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    ConflictError,
    TooManyRequestsError,
    InternalServerError,
    ServiceUnavailableError,
} from './http-errors.js';

// Error Utilities
export {
    isDatabaseError,
    isHttpError,
    hasStatusCode,
} from './error-utils.js';
