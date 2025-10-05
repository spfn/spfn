/**
 * Error Module Exports
 *
 * 에러 처리 모듈의 진입점 (Pure re-export only)
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