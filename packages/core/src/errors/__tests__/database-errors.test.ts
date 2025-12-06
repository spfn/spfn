/**
 * Database Errors Tests
 */

import { describe, it, expect } from 'vitest';
import {
    DatabaseError,
    ConnectionError,
    QueryError,
    EntityNotFoundError,
    ConstraintViolationError,
    TransactionError,
    DeadlockError,
    DuplicateEntryError,
} from '../database-errors';
import { SerializableError } from '../serializable-error';

describe('DatabaseError', () =>
{
    it('should create DatabaseError with correct properties', () =>
    {
        const error = new DatabaseError({
            message: 'Test error',
            statusCode: 500,
            details: { test: 'data' },
        });

        expect(error.name).toBe('DatabaseError');
        expect(error.message).toBe('Test error');
        expect(error.statusCode).toBe(500);
        expect(error.details).toEqual({ test: 'data' });
        expect(error.stack).toBeDefined();
    });

    it('should use default status code 500', () =>
    {
        const error = new DatabaseError({ message: 'Test error' });

        expect(error.statusCode).toBe(500);
    });

    it('should extend SerializableError', () =>
    {
        const error = new DatabaseError({ message: 'Test error' });

        expect(error).toBeInstanceOf(SerializableError);
        expect(error).toBeInstanceOf(DatabaseError);
    });

    it('should serialize to JSON correctly', () =>
    {
        const error = new DatabaseError({
            message: 'Test error',
            statusCode: 500,
            details: { field: 'value' },
        });

        const json = error.toJSON();

        expect(json.__type).toBe('DatabaseError');
        expect(json.message).toBe('Test error');
        expect(json.details).toEqual({ field: 'value' });
    });
});

describe('ConnectionError', () =>
{
    it('should create ConnectionError with status code 503', () =>
    {
        const error = new ConnectionError({
            message: 'Connection failed',
            details: { host: 'localhost' },
        });

        expect(error.name).toBe('ConnectionError');
        expect(error.message).toBe('Connection failed');
        expect(error.statusCode).toBe(503);
        expect(error.details).toEqual({ host: 'localhost' });
    });

    it('should be instance of DatabaseError and SerializableError', () =>
    {
        const error = new ConnectionError({ message: 'Connection failed' });

        expect(error).toBeInstanceOf(SerializableError);
        expect(error).toBeInstanceOf(DatabaseError);
        expect(error).toBeInstanceOf(ConnectionError);
    });
});

describe('QueryError', () =>
{
    it('should create QueryError with default status code 500', () =>
    {
        const error = new QueryError({ message: 'Query failed' });

        expect(error.name).toBe('QueryError');
        expect(error.message).toBe('Query failed');
        expect(error.statusCode).toBe(500);
    });

    it('should accept custom status code', () =>
    {
        const error = new QueryError({ message: 'Query failed', statusCode: 400 });

        expect(error.statusCode).toBe(400);
    });

    it('should be instance of DatabaseError and SerializableError', () =>
    {
        const error = new QueryError({ message: 'Query failed' });

        expect(error).toBeInstanceOf(SerializableError);
        expect(error).toBeInstanceOf(DatabaseError);
        expect(error).toBeInstanceOf(QueryError);
    });
});

describe('EntityNotFoundError', () =>
{
    it('should create EntityNotFoundError with correct message and details', () =>
    {
        const error = new EntityNotFoundError({ resource: 'User', id: 123 });

        expect(error.name).toBe('EntityNotFoundError');
        expect(error.message).toBe('User with id 123 not found');
        expect(error.statusCode).toBe(404);
        expect(error.details).toEqual({ resource: 'User', id: 123 });
        expect(error.resource).toBe('User');
        expect(error.id).toBe(123);
    });

    it('should handle string IDs', () =>
    {
        const error = new EntityNotFoundError({ resource: 'Post', id: 'abc-123' });

        expect(error.message).toBe('Post with id abc-123 not found');
        expect(error.details).toEqual({ resource: 'Post', id: 'abc-123' });
        expect(error.resource).toBe('Post');
        expect(error.id).toBe('abc-123');
    });

    it('should be instance of QueryError, DatabaseError, and SerializableError', () =>
    {
        const error = new EntityNotFoundError({ resource: 'User', id: 123 });

        expect(error).toBeInstanceOf(SerializableError);
        expect(error).toBeInstanceOf(DatabaseError);
        expect(error).toBeInstanceOf(QueryError);
        expect(error).toBeInstanceOf(EntityNotFoundError);
    });
});

describe('ConstraintViolationError', () =>
{
    it('should create ConstraintViolationError with status code 400', () =>
    {
        const error = new ConstraintViolationError({
            message: 'Invalid data',
            details: { field: 'email' },
        });

        expect(error.name).toBe('ConstraintViolationError');
        expect(error.message).toBe('Invalid data');
        expect(error.statusCode).toBe(400);
        expect(error.details).toEqual({ field: 'email' });
    });

    it('should be instance of QueryError, DatabaseError, and SerializableError', () =>
    {
        const error = new ConstraintViolationError({ message: 'Invalid data' });

        expect(error).toBeInstanceOf(SerializableError);
        expect(error).toBeInstanceOf(DatabaseError);
        expect(error).toBeInstanceOf(QueryError);
        expect(error).toBeInstanceOf(ConstraintViolationError);
    });
});

describe('TransactionError', () =>
{
    it('should create TransactionError with default status code 500', () =>
    {
        const error = new TransactionError({ message: 'Transaction failed' });

        expect(error.name).toBe('TransactionError');
        expect(error.message).toBe('Transaction failed');
        expect(error.statusCode).toBe(500);
    });

    it('should accept custom status code', () =>
    {
        const error = new TransactionError({ message: 'Transaction failed', statusCode: 409 });

        expect(error.statusCode).toBe(409);
    });

    it('should be instance of DatabaseError and SerializableError', () =>
    {
        const error = new TransactionError({ message: 'Transaction failed' });

        expect(error).toBeInstanceOf(SerializableError);
        expect(error).toBeInstanceOf(DatabaseError);
        expect(error).toBeInstanceOf(TransactionError);
    });
});

describe('DeadlockError', () =>
{
    it('should create DeadlockError with status code 409', () =>
    {
        const error = new DeadlockError({
            message: 'Deadlock detected',
            details: { tables: ['users'] },
        });

        expect(error.name).toBe('DeadlockError');
        expect(error.message).toBe('Deadlock detected');
        expect(error.statusCode).toBe(409);
        expect(error.details).toEqual({ tables: ['users'] });
    });

    it('should be instance of TransactionError, DatabaseError, and SerializableError', () =>
    {
        const error = new DeadlockError({ message: 'Deadlock detected' });

        expect(error).toBeInstanceOf(SerializableError);
        expect(error).toBeInstanceOf(DatabaseError);
        expect(error).toBeInstanceOf(TransactionError);
        expect(error).toBeInstanceOf(DeadlockError);
    });
});

describe('DuplicateEntryError', () =>
{
    it('should create DuplicateEntryError with correct message and details', () =>
    {
        const error = new DuplicateEntryError({ field: 'email', value: 'test@example.com' });

        expect(error.name).toBe('DuplicateEntryError');
        expect(error.message).toBe("email 'test@example.com' already exists");
        expect(error.statusCode).toBe(409);
        expect(error.details).toEqual({ field: 'email', value: 'test@example.com' });
        expect(error.field).toBe('email');
        expect(error.value).toBe('test@example.com');
    });

    it('should handle numeric values', () =>
    {
        const error = new DuplicateEntryError({ field: 'user_id', value: 123 });

        expect(error.message).toBe("user_id '123' already exists");
        expect(error.details).toEqual({ field: 'user_id', value: 123 });
        expect(error.field).toBe('user_id');
        expect(error.value).toBe(123);
    });

    it('should be instance of QueryError, DatabaseError, and SerializableError', () =>
    {
        const error = new DuplicateEntryError({ field: 'email', value: 'test@example.com' });

        expect(error).toBeInstanceOf(SerializableError);
        expect(error).toBeInstanceOf(DatabaseError);
        expect(error).toBeInstanceOf(QueryError);
        expect(error).toBeInstanceOf(DuplicateEntryError);
    });
});
