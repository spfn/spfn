/**
 * Repository Error Wrapping Tests
 *
 * Tests for BaseRepository.withContext and RepositoryError
 */

import { describe, it, expect, vi } from 'vitest';
import { BaseRepository, RepositoryError } from '../repository';

// Mock repository for testing
class TestRepository extends BaseRepository
{
    // Expose withContext for testing
    public async testWithContext<T>(
        queryFn: () => Promise<T>,
        context: { method?: string; table?: string } = {},
    ): Promise<T>
    {
        return this.withContext(queryFn, context);
    }
}

describe('RepositoryError', () =>
{
    it('should create error with repository context', () =>
    {
        const originalError = new Error('Query failed');
        const error = new RepositoryError(
            'Query failed',
            'UserRepository',
            'findById',
            'users',
            originalError,
        );

        expect(error.name).toBe('RepositoryError');
        expect(error.message).toBe('Query failed');
        expect(error.repository).toBe('UserRepository');
        expect(error.method).toBe('findById');
        expect(error.table).toBe('users');
        expect(error.originalError).toBe(originalError);
    });

    it('should preserve original stack trace', () =>
    {
        const originalError = new Error('Query failed');
        const originalStack = originalError.stack;

        const error = new RepositoryError(
            'Query failed',
            'UserRepository',
            'findById',
            'users',
            originalError,
        );

        expect(error.stack).toBe(originalStack);
    });
});

describe('BaseRepository.withContext', () =>
{
    it('should execute query successfully', async () =>
    {
        const repo = new TestRepository();
        const queryFn = vi.fn().mockResolvedValue({ id: 1, name: 'John' });

        const result = await repo.testWithContext(queryFn, {
            method: 'findById',
            table: 'users',
        });

        expect(queryFn).toHaveBeenCalled();
        expect(result).toEqual({ id: 1, name: 'John' });
    });

    it('should wrap query error with repository context', async () =>
    {
        const repo = new TestRepository();
        const queryFn = vi.fn().mockRejectedValue(new Error('Connection failed'));

        await expect(
            repo.testWithContext(queryFn, {
                method: 'findById',
                table: 'users',
            }),
        ).rejects.toThrow(RepositoryError);

        try
        {
            await repo.testWithContext(queryFn, {
                method: 'findById',
                table: 'users',
            });
        }
        catch (error)
        {
            expect(error).toBeInstanceOf(RepositoryError);
            if (error instanceof RepositoryError)
            {
                expect(error.repository).toBe('TestRepository');
                expect(error.method).toBe('findById');
                expect(error.table).toBe('users');
                expect(error.message).toBe('Connection failed');
            }
        }
    });

    it('should handle non-Error rejections', async () =>
    {
        const repo = new TestRepository();
        const queryFn = vi.fn().mockRejectedValue('String error');

        await expect(
            repo.testWithContext(queryFn, {
                method: 'findById',
                table: 'users',
            }),
        ).rejects.toThrow(RepositoryError);

        try
        {
            await repo.testWithContext(queryFn, {
                method: 'findById',
                table: 'users',
            });
        }
        catch (error)
        {
            expect(error).toBeInstanceOf(RepositoryError);
            if (error instanceof RepositoryError)
            {
                expect(error.message).toBe('String error');
            }
        }
    });

    it('should work without context parameters', async () =>
    {
        const repo = new TestRepository();
        const queryFn = vi.fn().mockRejectedValue(new Error('Query failed'));

        try
        {
            await repo.testWithContext(queryFn);
        }
        catch (error)
        {
            expect(error).toBeInstanceOf(RepositoryError);
            if (error instanceof RepositoryError)
            {
                expect(error.repository).toBe('TestRepository');
                expect(error.method).toBeUndefined();
                expect(error.table).toBeUndefined();
            }
        }
    });

    it('should preserve query result type', async () =>
    {
        const repo = new TestRepository();

        // Test with object
        const objectResult = await repo.testWithContext(
            async () => ({ id: 1, name: 'John' }),
            { method: 'findById' },
        );
        expect(objectResult).toEqual({ id: 1, name: 'John' });

        // Test with array
        const arrayResult = await repo.testWithContext(
            async () => [1, 2, 3],
            { method: 'findMany' },
        );
        expect(arrayResult).toEqual([1, 2, 3]);

        // Test with number
        const numberResult = await repo.testWithContext(
            async () => 42,
            { method: 'count' },
        );
        expect(numberResult).toBe(42);
    });
});
