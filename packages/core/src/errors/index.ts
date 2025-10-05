/**
 * Error Module Exports
 *
 * Entry point for error handling module (Pure re-export only)
 */

// Error Classes
export {
    DatabaseError,
    ConnectionError,
    QueryError,
    NotFoundError,
    ValidationError,
    TransactionError,
    DeadlockError,
    DuplicateEntryError,
} from './database-errors.js';

// Error Utilities
export { isDatabaseError, fromPostgresError } from './error-utils.js';
