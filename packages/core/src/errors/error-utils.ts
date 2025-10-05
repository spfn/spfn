/**
 * Error Utility Functions
 *
 * Error type checking and conversion utilities
 */

import { DatabaseError, ConnectionError, DuplicateEntryError, DeadlockError, ValidationError, QueryError } from './database-errors.js';

/**
 * Check if error is a DatabaseError
 */
export function isDatabaseError(error: unknown): error is DatabaseError
{
    return error instanceof DatabaseError;
}

/**
 * Convert PostgreSQL error code to custom error
 *
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export function fromPostgresError(error: any): DatabaseError
{
    const code = error?.code;
    const message = error?.message || 'Database error occurred';

    switch (code)
    {
        // Connection errors
        case '08000': // connection_exception
        case '08003': // connection_does_not_exist
        case '08006': // connection_failure
            return new ConnectionError(message, { code });

        // Unique violation
        case '23505':
            const match = message.match(/Key \((\w+)\)=\(([^)]+)\)/);
            if (match)
            {
                return new DuplicateEntryError(match[1], match[2]);
            }
            return new DuplicateEntryError('field', 'value');

        // Deadlock
        case '40P01':
            return new DeadlockError(message, { code });

        // Foreign key violation
        case '23503':
            return new ValidationError(message, { code, constraint: 'foreign_key' });

        // Default
        default:
            return new QueryError(message, 500, { code });
    }
}
