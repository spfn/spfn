/**
 * Database Errors Tests
 */

import { describe, it, expect } from 'vitest';
import {
    DatabaseError,
    ConnectionError,
    QueryError,
    NotFoundError,
    ValidationError,
    TransactionError,
    DeadlockError,
    DuplicateEntryError,
} from '../database-errors.js';

describe('DatabaseError', () =>
{
    it('should create DatabaseError with correct properties', () =>
    {
        const error = new DatabaseError('Test error', 500, { test: 'data' });

        expect(error.name).toBe('DatabaseError');
        expect(error.message).toBe('Test error');
        expect(error.statusCode).toBe(500);
        expect(error.details).toEqual({ test: 'data' });
        expect(error.timestamp).toBeInstanceOf(Date);
        expect(error.stack).toBeDefined();
    });

    it('should use default status code 500', () =>
    {
        const error = new DatabaseError('Test error');

        expect(error.statusCode).toBe(500);
    });

    it('should serialize to JSON correctly', () =>
    {
        const error = new DatabaseError('Test error', 500, { test: 'data' });
        const json = error.toJSON();

        expect(json).toEqual({
            name: 'DatabaseError',
            message: 'Test error',
            statusCode: 500,
            details: { test: 'data' },
            timestamp: expect.any(String)
        });
    });
});

describe('ConnectionError', () =>
{
    it('should create ConnectionError with status code 503', () =>
    {
        const error = new ConnectionError('Connection failed', { host: 'localhost' });

        expect(error.name).toBe('ConnectionError');
        expect(error.message).toBe('Connection failed');
        expect(error.statusCode).toBe(503);
        expect(error.details).toEqual({ host: 'localhost' });
    });

    it('should be instance of DatabaseError', () =>
    {
        const error = new ConnectionError('Connection failed');

        expect(error).toBeInstanceOf(DatabaseError);
        expect(error).toBeInstanceOf(ConnectionError);
    });
});

describe('QueryError', () =>
{
    it('should create QueryError with default status code 500', () =>
    {
        const error = new QueryError('Query failed');

        expect(error.name).toBe('QueryError');
        expect(error.message).toBe('Query failed');
        expect(error.statusCode).toBe(500);
    });

    it('should accept custom status code', () =>
    {
        const error = new QueryError('Query failed', 400);

        expect(error.statusCode).toBe(400);
    });

    it('should be instance of DatabaseError', () =>
    {
        const error = new QueryError('Query failed');

        expect(error).toBeInstanceOf(DatabaseError);
        expect(error).toBeInstanceOf(QueryError);
    });
});

describe('NotFoundError', () =>
{
    it('should create NotFoundError with correct message and details', () =>
    {
        const error = new NotFoundError('User', 123);

        expect(error.name).toBe('NotFoundError');
        expect(error.message).toBe('User with id 123 not found');
        expect(error.statusCode).toBe(404);
        expect(error.details).toEqual({ resource: 'User', id: 123 });
    });

    it('should handle string IDs', () =>
    {
        const error = new NotFoundError('Post', 'abc-123');

        expect(error.message).toBe('Post with id abc-123 not found');
        expect(error.details).toEqual({ resource: 'Post', id: 'abc-123' });
    });

    it('should be instance of QueryError and DatabaseError', () =>
    {
        const error = new NotFoundError('User', 123);

        expect(error).toBeInstanceOf(DatabaseError);
        expect(error).toBeInstanceOf(QueryError);
        expect(error).toBeInstanceOf(NotFoundError);
    });
});

describe('ValidationError', () =>
{
    it('should create ValidationError with status code 400', () =>
    {
        const error = new ValidationError('Invalid data', { field: 'email' });

        expect(error.name).toBe('ValidationError');
        expect(error.message).toBe('Invalid data');
        expect(error.statusCode).toBe(400);
        expect(error.details).toEqual({ field: 'email' });
    });

    it('should be instance of QueryError and DatabaseError', () =>
    {
        const error = new ValidationError('Invalid data');

        expect(error).toBeInstanceOf(DatabaseError);
        expect(error).toBeInstanceOf(QueryError);
        expect(error).toBeInstanceOf(ValidationError);
    });
});

describe('TransactionError', () =>
{
    it('should create TransactionError with default status code 500', () =>
    {
        const error = new TransactionError('Transaction failed');

        expect(error.name).toBe('TransactionError');
        expect(error.message).toBe('Transaction failed');
        expect(error.statusCode).toBe(500);
    });

    it('should accept custom status code', () =>
    {
        const error = new TransactionError('Transaction failed', 409);

        expect(error.statusCode).toBe(409);
    });

    it('should be instance of DatabaseError', () =>
    {
        const error = new TransactionError('Transaction failed');

        expect(error).toBeInstanceOf(DatabaseError);
        expect(error).toBeInstanceOf(TransactionError);
    });
});

describe('DeadlockError', () =>
{
    it('should create DeadlockError with status code 409', () =>
    {
        const error = new DeadlockError('Deadlock detected', { tables: ['users'] });

        expect(error.name).toBe('DeadlockError');
        expect(error.message).toBe('Deadlock detected');
        expect(error.statusCode).toBe(409);
        expect(error.details).toEqual({ tables: ['users'] });
    });

    it('should be instance of TransactionError and DatabaseError', () =>
    {
        const error = new DeadlockError('Deadlock detected');

        expect(error).toBeInstanceOf(DatabaseError);
        expect(error).toBeInstanceOf(TransactionError);
        expect(error).toBeInstanceOf(DeadlockError);
    });
});

describe('DuplicateEntryError', () =>
{
    it('should create DuplicateEntryError with correct message and details', () =>
    {
        const error = new DuplicateEntryError('email', 'test@example.com');

        expect(error.name).toBe('DuplicateEntryError');
        expect(error.message).toBe("email 'test@example.com' already exists");
        expect(error.statusCode).toBe(409);
        expect(error.details).toEqual({ field: 'email', value: 'test@example.com' });
    });

    it('should handle numeric values', () =>
    {
        const error = new DuplicateEntryError('user_id', 123);

        expect(error.message).toBe("user_id '123' already exists");
        expect(error.details).toEqual({ field: 'user_id', value: 123 });
    });

    it('should be instance of QueryError and DatabaseError', () =>
    {
        const error = new DuplicateEntryError('email', 'test@example.com');

        expect(error).toBeInstanceOf(DatabaseError);
        expect(error).toBeInstanceOf(QueryError);
        expect(error).toBeInstanceOf(DuplicateEntryError);
    });
});