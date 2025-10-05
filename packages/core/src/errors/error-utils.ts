/**
 * Error Utility Functions
 *
 * 에러 타입 체크 및 변환 유틸리티
 */

import { DatabaseError, ConnectionError, DuplicateEntryError, DeadlockError, ValidationError, QueryError } from './database-errors.js';

/**
 * 에러가 DatabaseError 계열인지 확인
 */
export function isDatabaseError(error: unknown): error is DatabaseError
{
    return error instanceof DatabaseError;
}

/**
 * PostgreSQL 에러 코드를 커스텀 에러로 변환
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
            return new ConnectionError(message);

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
            return new DeadlockError(message);

        // Foreign key violation
        case '23503':
            return new ValidationError(message);

        // Default
        default:
            return new QueryError(message);
    }
}