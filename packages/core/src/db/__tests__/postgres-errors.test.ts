/**
 * PostgreSQL Error Conversion Tests
 *
 * Tests error code mapping and conversion utilities
 */

import { describe, it, expect } from 'vitest';
import { fromPostgresError } from '../postgres-errors';

describe('PostgreSQL Error Conversion', () =>
{
    describe('fromPostgresError()', () =>
    {
        describe('Connection Errors (Class 08)', () =>
        {
            it('should convert 08000 to ConnectionError', () =>
            {
                const pgError = { code: '08000', message: 'Connection exception' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConnectionError');
                expect(error.message).toBe('Connection exception');
                expect(error.details?.code).toBe('08000');
            });

            it('should convert 08001 to ConnectionError', () =>
            {
                const pgError = { code: '08001', message: 'Unable to establish connection' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConnectionError');
            });

            it('should convert 08003 to ConnectionError', () =>
            {
                const pgError = { code: '08003', message: 'Connection does not exist' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConnectionError');
            });

            it('should convert 08004 to ConnectionError', () =>
            {
                const pgError = { code: '08004', message: 'Server rejected connection' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConnectionError');
            });

            it('should convert 08006 to ConnectionError', () =>
            {
                const pgError = { code: '08006', message: 'Connection failure' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConnectionError');
            });

            it('should convert 08007 to ConnectionError', () =>
            {
                const pgError = { code: '08007', message: 'Transaction resolution unknown' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConnectionError');
            });

            it('should convert 08P01 to ConnectionError', () =>
            {
                const pgError = { code: '08P01', message: 'Protocol violation' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConnectionError');
            });
        });

        describe('Integrity Constraint Violations (Class 23)', () =>
        {
            it('should convert 23000 to ConstraintViolationError', () =>
            {
                const pgError = { code: '23000', message: 'Integrity constraint violation' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConstraintViolationError');
                expect(error.details?.constraint).toBe('integrity');
            });

            it('should convert 23001 to ConstraintViolationError', () =>
            {
                const pgError = { code: '23001', message: 'Restrict violation' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConstraintViolationError');
                expect(error.details?.constraint).toBe('integrity');
            });

            it('should convert 23502 to ConstraintViolationError for not_null', () =>
            {
                const pgError = { code: '23502', message: 'null value in column "email" violates not-null constraint' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConstraintViolationError');
                expect(error.details?.constraint).toBe('not_null');
            });

            it('should convert 23503 to ConstraintViolationError for foreign_key', () =>
            {
                const pgError = { code: '23503', message: 'Foreign key constraint violated' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConstraintViolationError');
                expect(error.details?.constraint).toBe('foreign_key');
            });

            it('should convert 23514 to ConstraintViolationError for check', () =>
            {
                const pgError = { code: '23514', message: 'Check constraint violated' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConstraintViolationError');
                expect(error.details?.constraint).toBe('check');
            });
        });

        describe('Unique Violations (23505)', () =>
        {
            it('should convert simple unique violation with field parsing', () =>
            {
                const pgError = {
                    code: '23505',
                    message: 'duplicate key value violates unique constraint "users_email_key"\nDetail: Key (email)=(test@example.com) already exists.'
                };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('DuplicateEntryError');
                expect(error.message).toContain('email');
                expect(error.message).toContain('test@example.com');
            });

            it('should parse field and value from unique violation', () =>
            {
                const pgError = {
                    code: '23505',
                    message: 'Key (username)=(john_doe) already exists.'
                };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('DuplicateEntryError');
                expect(error.message).toContain('username');
                expect(error.message).toContain('john_doe');
            });

            it('should handle complex unique violations with multiple fields', () =>
            {
                const pgError = {
                    code: '23505',
                    message: 'Key (user_id, tenant_id)=(123, 456) already exists.'
                };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('DuplicateEntryError');
            });

            it('should handle quoted field names', () =>
            {
                const pgError = {
                    code: '23505',
                    message: 'Key ("email")=(\'test@example.com\') already exists.'
                };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('DuplicateEntryError');
            });

            it('should fallback to generic duplicate when parsing fails', () =>
            {
                const pgError = {
                    code: '23505',
                    message: 'Unique constraint violated'
                };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('DuplicateEntryError');
            });
        });

        describe('Transaction Rollback (Class 40)', () =>
        {
            it('should convert 40000 to TransactionError', () =>
            {
                const pgError = { code: '40000', message: 'Transaction rollback' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('TransactionError');
                expect(error.statusCode).toBe(500);
            });

            it('should convert 40001 to TransactionError for serialization failure', () =>
            {
                const pgError = { code: '40001', message: 'Serialization failure' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('TransactionError');
            });

            it('should convert 40002 to TransactionError', () =>
            {
                const pgError = { code: '40002', message: 'Transaction integrity constraint violation' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('TransactionError');
            });

            it('should convert 40003 to TransactionError', () =>
            {
                const pgError = { code: '40003', message: 'Statement completion unknown' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('TransactionError');
            });

            it('should convert 40P01 to DeadlockError', () =>
            {
                const pgError = { code: '40P01', message: 'Deadlock detected' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('DeadlockError');
                expect(error.details?.code).toBe('40P01');
            });
        });

        describe('Syntax Error / Access Violations (Class 42)', () =>
        {
            it('should convert 42000 to QueryError', () =>
            {
                const pgError = { code: '42000', message: 'Syntax error or access rule violation' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('QueryError');
                expect(error.statusCode).toBe(400);
            });

            it('should convert 42601 to QueryError for syntax error', () =>
            {
                const pgError = { code: '42601', message: 'Syntax error at or near "SELEC"' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('QueryError');
            });

            it('should convert 42501 to QueryError for insufficient privilege', () =>
            {
                const pgError = { code: '42501', message: 'Insufficient privilege' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('QueryError');
            });

            it('should convert 42602 to QueryError for invalid name', () =>
            {
                const pgError = { code: '42602', message: 'Invalid name' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('QueryError');
            });

            it('should convert 42622 to QueryError for name too long', () =>
            {
                const pgError = { code: '42622', message: 'Name too long' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('QueryError');
            });

            it('should convert 42701 to QueryError for duplicate column', () =>
            {
                const pgError = { code: '42701', message: 'Duplicate column' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('QueryError');
            });

            it('should convert 42702 to QueryError for ambiguous column', () =>
            {
                const pgError = { code: '42702', message: 'Ambiguous column' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('QueryError');
            });

            it('should convert 42703 to QueryError for undefined column', () =>
            {
                const pgError = { code: '42703', message: 'Column "foo" does not exist' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('QueryError');
            });

            it('should convert 42704 to QueryError for undefined object', () =>
            {
                const pgError = { code: '42704', message: 'Undefined object' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('QueryError');
            });

            it('should convert 42P01 to QueryError for undefined table', () =>
            {
                const pgError = { code: '42P01', message: 'Relation "users" does not exist' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('QueryError');
            });

            it('should convert 42P02 to QueryError for undefined parameter', () =>
            {
                const pgError = { code: '42P02', message: 'Undefined parameter' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('QueryError');
            });
        });

        describe('Insufficient Resources (Class 53)', () =>
        {
            it('should convert 53000 to ConnectionError', () =>
            {
                const pgError = { code: '53000', message: 'Insufficient resources' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConnectionError');
            });

            it('should convert 53100 to ConnectionError for disk full', () =>
            {
                const pgError = { code: '53100', message: 'Disk full' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConnectionError');
            });

            it('should convert 53200 to ConnectionError for out of memory', () =>
            {
                const pgError = { code: '53200', message: 'Out of memory' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConnectionError');
            });

            it('should convert 53300 to ConnectionError for too many connections', () =>
            {
                const pgError = { code: '53300', message: 'Too many connections' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConnectionError');
            });
        });

        describe('Operator Intervention (Class 57)', () =>
        {
            it('should convert 57000 to ConnectionError', () =>
            {
                const pgError = { code: '57000', message: 'Operator intervention' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConnectionError');
            });

            it('should convert 57014 to ConnectionError for query canceled', () =>
            {
                const pgError = { code: '57014', message: 'Query canceled' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConnectionError');
            });

            it('should convert 57P01 to ConnectionError for admin shutdown', () =>
            {
                const pgError = { code: '57P01', message: 'Admin shutdown' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConnectionError');
            });

            it('should convert 57P02 to ConnectionError for crash shutdown', () =>
            {
                const pgError = { code: '57P02', message: 'Crash shutdown' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConnectionError');
            });

            it('should convert 57P03 to ConnectionError for cannot connect now', () =>
            {
                const pgError = { code: '57P03', message: 'Cannot connect now' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('ConnectionError');
            });
        });

        describe('Unknown Errors', () =>
        {
            it('should convert unknown error code to QueryError', () =>
            {
                const pgError = { code: '99999', message: 'Unknown error' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('QueryError');
                expect(error.statusCode).toBe(500);
                expect(error.details?.code).toBe('99999');
            });

            it('should handle missing error code', () =>
            {
                const pgError = { message: 'Error without code' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('QueryError');
                expect(error.message).toBe('Error without code');
            });

            it('should handle missing error message', () =>
            {
                const pgError = { code: '42601' };
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('QueryError');
                expect(error.message).toBe('Database error occurred');
            });

            it('should handle completely empty error object', () =>
            {
                const pgError = {};
                const error = fromPostgresError(pgError);

                expect(error.name).toBe('QueryError');
                expect(error.message).toBe('Database error occurred');
            });

            it('should handle null error', () =>
            {
                const error = fromPostgresError(null);

                expect(error.name).toBe('QueryError');
                expect(error.message).toBe('Database error occurred');
            });

            it('should handle undefined error', () =>
            {
                const error = fromPostgresError(undefined);

                expect(error.name).toBe('QueryError');
                expect(error.message).toBe('Database error occurred');
            });
        });
    });
});