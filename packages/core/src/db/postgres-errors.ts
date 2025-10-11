/**
 * PostgreSQL Error Conversion Utilities
 *
 * Converts PostgreSQL-specific error codes to custom error types
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */

import {
    DatabaseError,
    ConnectionError,
    DuplicateEntryError,
    DeadlockError,
    ValidationError,
    QueryError,
    TransactionError,
} from '../errors/database-errors.js';

/**
 * Extract field and value from PostgreSQL unique violation message
 *
 * Handles various formats:
 * - Simple: Key (email)=(test@example.com)
 * - Complex: Key (user_id, tenant_id)=(123, 456)
 * - With quotes: Key ("field")=('value')
 */
function parseUniqueViolation(message: string): { field: string; value: string } | null
{
    // Try multiple patterns for robustness
    const patterns = [
        // Standard format: Key (field)=(value)
        /Key \(([^)]+)\)=\(([^)]+)\)/i,
        // With quotes: Key ("field")=('value')
        /Key \(["']?([^)"']+)["']?\)=\(["']?([^)"']+)["']?\)/i,
        // Alternative format
        /Key `([^`]+)`=`([^`]+)`/i,
    ];

    for (const pattern of patterns)
    {
        const match = message.match(pattern);
        if (match)
        {
            // Clean up extracted values
            const field = match[1].trim().replace(/["'`]/g, '');
            const value = match[2].trim().replace(/["'`]/g, '');
            return { field, value };
        }
    }

    return null;
}

/**
 * Convert PostgreSQL error to custom DatabaseError
 *
 * Maps PostgreSQL error codes to appropriate error classes with correct status codes
 *
 * @param error - PostgreSQL error object (from pg driver or Drizzle)
 * @returns Custom DatabaseError instance
 *
 * @example
 * ```typescript
 * import { fromPostgresError } from '@spfn/core/db';
 *
 * try {
 *   await db.insert(users).values(data);
 * } catch (pgError) {
 *   throw fromPostgresError(pgError);
 * }
 * ```
 */
export function fromPostgresError(error: any): DatabaseError
{
    const code = error?.code;
    const message = error?.message || 'Database error occurred';

    switch (code)
    {
        // Class 08 — Connection Exception
        case '08000': // connection_exception
        case '08001': // sqlclient_unable_to_establish_sqlconnection
        case '08003': // connection_does_not_exist
        case '08004': // sqlserver_rejected_establishment_of_sqlconnection
        case '08006': // connection_failure
        case '08007': // transaction_resolution_unknown
        case '08P01': // protocol_violation
            return new ConnectionError(message, { code });

        // Class 23 — Integrity Constraint Violation
        case '23000': // integrity_constraint_violation
        case '23001': // restrict_violation
            return new ValidationError(message, { code, constraint: 'integrity' });

        case '23502': // not_null_violation
            return new ValidationError(message, { code, constraint: 'not_null' });

        case '23503': // foreign_key_violation
            return new ValidationError(message, { code, constraint: 'foreign_key' });

        case '23505': // unique_violation
            const parsed = parseUniqueViolation(message);
            if (parsed)
            {
                return new DuplicateEntryError(parsed.field, parsed.value);
            }
            return new DuplicateEntryError('field', 'value');

        case '23514': // check_violation
            return new ValidationError(message, { code, constraint: 'check' });

        // Class 40 — Transaction Rollback
        case '40000': // transaction_rollback
        case '40001': // serialization_failure
        case '40002': // transaction_integrity_constraint_violation
        case '40003': // statement_completion_unknown
            return new TransactionError(message, 500, { code });

        case '40P01': // deadlock_detected
            return new DeadlockError(message, { code });

        // Class 42 — Syntax Error or Access Rule Violation
        case '42000': // syntax_error_or_access_rule_violation
        case '42601': // syntax_error
        case '42501': // insufficient_privilege
        case '42602': // invalid_name
        case '42622': // name_too_long
        case '42701': // duplicate_column
        case '42702': // ambiguous_column
        case '42703': // undefined_column
        case '42704': // undefined_object
        case '42P01': // undefined_table
        case '42P02': // undefined_parameter
            return new QueryError(message, 400, { code });

        // Class 53 — Insufficient Resources
        case '53000': // insufficient_resources
        case '53100': // disk_full
        case '53200': // out_of_memory
        case '53300': // too_many_connections
            return new ConnectionError(message, { code });

        // Class 57 — Operator Intervention
        case '57000': // operator_intervention
        case '57014': // query_canceled
        case '57P01': // admin_shutdown
        case '57P02': // crash_shutdown
        case '57P03': // cannot_connect_now
            return new ConnectionError(message, { code });

        // Default: Unknown error
        default:
            return new QueryError(message, 500, { code });
    }
}