/**
 * PostgreSQL Error Conversion Tests
 */

import { describe, it, expect } from 'vitest';
import { fromPostgresError } from '../postgres-errors.js';
import {
    ConnectionError,
    DuplicateEntryError,
    DeadlockError,
    ValidationError,
    QueryError,
    TransactionError,
} from '../../errors';

describe('fromPostgresError', () =>
{
    describe('Connection Errors (Class 08)', () =>
    {
        it('should convert error code 08000 (connection_exception)', () =>
        {
            const pgError = { code: '08000', message: 'connection_exception' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(ConnectionError);
            expect(error.statusCode).toBe(503);
            expect(error.details).toEqual({ code: '08000' });
        });

        it('should convert error code 08001 (sqlclient_unable_to_establish)', () =>
        {
            const pgError = { code: '08001', message: 'unable to establish connection' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(ConnectionError);
            expect(error.statusCode).toBe(503);
        });

        it('should convert error code 08003 (connection_does_not_exist)', () =>
        {
            const pgError = { code: '08003', message: 'connection_does_not_exist' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(ConnectionError);
            expect(error.statusCode).toBe(503);
        });

        it('should convert error code 08006 (connection_failure)', () =>
        {
            const pgError = { code: '08006', message: 'connection_failure' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(ConnectionError);
            expect(error.statusCode).toBe(503);
        });
    });

    describe('Integrity Constraint Violations (Class 23)', () =>
    {
        it('should convert unique violation (23505) with field and value', () =>
        {
            const pgError = {
                code: '23505',
                message: 'duplicate key value violates unique constraint "users_email_key"\nDetail: Key (email)=(test@example.com) already exists.'
            };

            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(DuplicateEntryError);
            expect(error.message).toBe("email 'test@example.com' already exists");
            expect(error.statusCode).toBe(409);
            expect(error.details).toEqual({ field: 'email', value: 'test@example.com' });
        });

        it('should convert unique violation (23505) with fallback values', () =>
        {
            const pgError = { code: '23505', message: 'duplicate key value' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(DuplicateEntryError);
            expect(error.message).toBe("field 'value' already exists");
            expect(error.details).toEqual({ field: 'field', value: 'value' });
        });

        it('should convert not_null violation (23502)', () =>
        {
            const pgError = { code: '23502', message: 'null value in column "name" violates not-null constraint' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(ValidationError);
            expect(error.statusCode).toBe(400);
            expect(error.details).toEqual({ code: '23502', constraint: 'not_null' });
        });

        it('should convert foreign key violation (23503)', () =>
        {
            const pgError = { code: '23503', message: 'foreign key constraint violated' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(ValidationError);
            expect(error.statusCode).toBe(400);
            expect(error.details).toEqual({ code: '23503', constraint: 'foreign_key' });
        });

        it('should convert check violation (23514)', () =>
        {
            const pgError = { code: '23514', message: 'check constraint violated' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(ValidationError);
            expect(error.statusCode).toBe(400);
            expect(error.details).toEqual({ code: '23514', constraint: 'check' });
        });
    });

    describe('Transaction Rollback (Class 40)', () =>
    {
        it('should convert deadlock error (40P01)', () =>
        {
            const pgError = { code: '40P01', message: 'deadlock detected' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(DeadlockError);
            expect(error.statusCode).toBe(409);
            expect(error.details).toEqual({ code: '40P01' });
        });

        it('should convert transaction rollback (40000)', () =>
        {
            const pgError = { code: '40000', message: 'transaction rollback' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(TransactionError);
            expect(error.statusCode).toBe(500);
            expect(error.details).toEqual({ code: '40000' });
        });

        it('should convert serialization failure (40001)', () =>
        {
            const pgError = { code: '40001', message: 'could not serialize access' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(TransactionError);
            expect(error.statusCode).toBe(500);
        });
    });

    describe('Syntax Errors (Class 42)', () =>
    {
        it('should convert syntax error (42601)', () =>
        {
            const pgError = { code: '42601', message: 'syntax error at or near "SELCT"' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(QueryError);
            expect(error.statusCode).toBe(400);
            expect(error.details).toEqual({ code: '42601' });
        });

        it('should convert undefined table (42P01)', () =>
        {
            const pgError = { code: '42P01', message: 'relation "users" does not exist' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(QueryError);
            expect(error.statusCode).toBe(400);
        });

        it('should convert undefined column (42703)', () =>
        {
            const pgError = { code: '42703', message: 'column "email" does not exist' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(QueryError);
            expect(error.statusCode).toBe(400);
        });
    });

    describe('Insufficient Resources (Class 53)', () =>
    {
        it('should convert too many connections (53300)', () =>
        {
            const pgError = { code: '53300', message: 'too many connections' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(ConnectionError);
            expect(error.statusCode).toBe(503);
        });

        it('should convert out of memory (53200)', () =>
        {
            const pgError = { code: '53200', message: 'out of memory' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(ConnectionError);
            expect(error.statusCode).toBe(503);
        });
    });

    describe('Operator Intervention (Class 57)', () =>
    {
        it('should convert query canceled (57014)', () =>
        {
            const pgError = { code: '57014', message: 'canceling statement due to user request' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(ConnectionError);
            expect(error.statusCode).toBe(503);
        });

        it('should convert admin shutdown (57P01)', () =>
        {
            const pgError = { code: '57P01', message: 'terminating connection due to administrator command' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(ConnectionError);
            expect(error.statusCode).toBe(503);
        });
    });

    describe('Edge Cases', () =>
    {
        it('should convert unknown error codes to QueryError', () =>
        {
            const pgError = { code: '99999', message: 'unknown error' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(QueryError);
            expect(error.statusCode).toBe(500);
            expect(error.details).toEqual({ code: '99999' });
        });

        it('should handle missing error code', () =>
        {
            const pgError = { message: 'error without code' };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(QueryError);
            expect(error.message).toBe('error without code');
            expect(error.details).toEqual({ code: undefined });
        });

        it('should use default message if error.message is missing', () =>
        {
            const pgError = { code: '08000' };
            const error = fromPostgresError(pgError);

            expect(error.message).toBe('Database error occurred');
        });

        it('should handle null or undefined input', () =>
        {
            const error1 = fromPostgresError(null);
            const error2 = fromPostgresError(undefined);

            expect(error1).toBeInstanceOf(QueryError);
            expect(error2).toBeInstanceOf(QueryError);
            expect(error1.message).toBe('Database error occurred');
            expect(error2.message).toBe('Database error occurred');
        });
    });

    describe('Unique Violation Parsing', () =>
    {
        it('should parse simple unique violation', () =>
        {
            const pgError = {
                code: '23505',
                message: 'Detail: Key (username)=(john123) already exists.'
            };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(DuplicateEntryError);
            expect(error.details).toEqual({ field: 'username', value: 'john123' });
        });

        it('should parse unique violation with special characters', () =>
        {
            const pgError = {
                code: '23505',
                message: 'Detail: Key (email)=(test+tag@example.com) already exists.'
            };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(DuplicateEntryError);
            expect(error.details).toEqual({ field: 'email', value: 'test+tag@example.com' });
        });

        it('should parse unique violation with quotes', () =>
        {
            const pgError = {
                code: '23505',
                message: 'Detail: Key ("user_id")=(\'123\') already exists.'
            };
            const error = fromPostgresError(pgError);

            expect(error).toBeInstanceOf(DuplicateEntryError);
            // Quotes should be stripped
            expect(error.details?.field).toBe('user_id');
            expect(error.details?.value).toBe('123');
        });
    });
});