/**
 * Error Module Exports
 *
 * Entry point for error handling module with serialization support
 */

// Base Classes
export { SerializableError } from './serializable-error';
export { ErrorRegistry } from './error-registry';
export type { SerializableErrorConstructor } from './error-registry';

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

// Core Error Registry
// Pre-configured registry with all built-in HTTP errors
import { ErrorRegistry } from './error-registry';
import {
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

export const coreErrorRegistry = new ErrorRegistry();
coreErrorRegistry.registerAll([
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
]);
