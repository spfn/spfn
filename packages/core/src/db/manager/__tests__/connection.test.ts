/**
 * Connection Unit Tests
 *
 * Tests database connection creation and health check functions.
 * Uses mocking to avoid real database connections.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDatabaseConnection, checkConnection } from '../connection';
import { ConnectionError } from '../../../errors/index';

// Mock postgres module
vi.mock('postgres', () => ({
    default: vi.fn(),
}));

// Mock logger
vi.mock('../../../logger', () => ({
    logger: {
        child: vi.fn(() => ({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        })),
    },
}));

// Mock postgres-errors
vi.mock('../../postgres-errors', () => ({
    fromPostgresError: vi.fn((error) => error instanceof Error ? error : new Error('Unknown error')),
}));

describe('Database Connection', () =>
{
    const mockPostgres = vi.fn();

    beforeEach(async () =>
    {
        vi.clearAllMocks();
        // Setup default postgres mock
        const postgres = (await import('postgres')).default;
        vi.mocked(postgres).mockImplementation(mockPostgres);
    });

    afterEach(() =>
    {
        vi.restoreAllMocks();
    });

    describe('createDatabaseConnection', () =>
    {
        it('should create connection successfully on first attempt', async () =>
        {
            const mockClient: any = vi.fn((sql: TemplateStringsArray) =>
                Promise.resolve([{ test: 1 }])
            );

            mockPostgres.mockReturnValue(mockClient);

            const poolConfig = { max: 10, idleTimeout: 20 };
            const retryConfig = {
                maxRetries: 3,
                initialDelay: 50,
                maxDelay: 5000,
                factor: 2,
            };

            const client = await createDatabaseConnection(
                'postgresql://test:test@localhost:5432/test',
                poolConfig,
                retryConfig
            );

            expect(mockPostgres).toHaveBeenCalledWith(
                'postgresql://test:test@localhost:5432/test',
                {
                    max: 10,
                    idle_timeout: 20,
                }
            );

            expect(client).toBe(mockClient);
        });

        it('should retry on connection failure and succeed', async () =>
        {
            let callCount = 0;
            const mockClient: any = vi.fn((sql: TemplateStringsArray) =>
            {
                callCount++;
                if (callCount === 1)
                {
                    throw new Error('Connection failed');
                }
                return Promise.resolve([{ test: 1 }]);
            });

            mockPostgres.mockReturnValue(mockClient);

            const poolConfig = { max: 10, idleTimeout: 20 };
            const retryConfig = {
                maxRetries: 3,
                initialDelay: 10,
                maxDelay: 1000,
                factor: 2,
            };

            const client = await createDatabaseConnection(
                'postgresql://test:test@localhost:5432/test',
                poolConfig,
                retryConfig
            );

            expect(callCount).toBe(2);
            expect(client).toBe(mockClient);
        });

        it('should throw ConnectionError after max retries', async () =>
        {
            const mockClient: any = vi.fn(() =>
                Promise.reject(new Error('Connection failed'))
            );

            mockPostgres.mockReturnValue(mockClient);

            const poolConfig = { max: 10, idleTimeout: 20 };
            const retryConfig = {
                maxRetries: 2,
                initialDelay: 10,
                maxDelay: 1000,
                factor: 2,
            };

            await expect(
                createDatabaseConnection(
                    'postgresql://test:test@localhost:5432/test',
                    poolConfig,
                    retryConfig
                )
            ).rejects.toThrow(ConnectionError);

            // Should attempt: initial + 2 retries = 3 total
            expect(mockClient).toHaveBeenCalledTimes(3);
        });

        it('should apply exponential backoff on retries', async () =>
        {
            const delays: number[] = [];
            let callCount = 0;

            const mockClient: any = vi.fn(() =>
            {
                callCount++;
                if (callCount <= 2)
                {
                    throw new Error('Connection failed');
                }
                return Promise.resolve([{ test: 1 }]);
            });

            mockPostgres.mockReturnValue(mockClient);

            // Mock delay function to track delays
            const originalSetTimeout = global.setTimeout;
            global.setTimeout = ((fn: any, delay: number) =>
            {
                if (typeof delay === 'number')
                {
                    delays.push(delay);
                }
                fn();
                return {} as any;
            }) as any;

            const poolConfig = { max: 10, idleTimeout: 20 };
            const retryConfig = {
                maxRetries: 3,
                initialDelay: 100,
                maxDelay: 10000,
                factor: 2,
            };

            await createDatabaseConnection(
                'postgresql://test:test@localhost:5432/test',
                poolConfig,
                retryConfig
            );

            global.setTimeout = originalSetTimeout;

            // First retry: 100ms, Second retry: 200ms
            expect(delays.length).toBe(2);
            expect(delays[0]).toBe(100);
            expect(delays[1]).toBe(200);
        });

        it('should cap delay at maxDelay', async () =>
        {
            const delays: number[] = [];
            let callCount = 0;

            const mockClient: any = vi.fn(() =>
            {
                callCount++;
                if (callCount <= 3)
                {
                    throw new Error('Connection failed');
                }
                return Promise.resolve([{ test: 1 }]);
            });

            mockPostgres.mockReturnValue(mockClient);

            const originalSetTimeout = global.setTimeout;
            global.setTimeout = ((fn: any, delay: number) =>
            {
                if (typeof delay === 'number')
                {
                    delays.push(delay);
                }
                fn();
                return {} as any;
            }) as any;

            const poolConfig = { max: 10, idleTimeout: 20 };
            const retryConfig = {
                maxRetries: 5,
                initialDelay: 100,
                maxDelay: 250, // Cap at 250ms
                factor: 2,
            };

            await createDatabaseConnection(
                'postgresql://test:test@localhost:5432/test',
                poolConfig,
                retryConfig
            );

            global.setTimeout = originalSetTimeout;

            // First: 100ms, Second: 200ms, Third: 250ms (capped)
            expect(delays[0]).toBe(100);
            expect(delays[1]).toBe(200);
            expect(delays[2]).toBe(250); // Should be capped at maxDelay
        });

        it('should handle connection success after retries with logging', async () =>
        {
            let callCount = 0;
            const mockClient: any = vi.fn(() =>
            {
                callCount++;
                if (callCount === 1)
                {
                    throw new Error('Connection failed');
                }
                return Promise.resolve([{ test: 1 }]);
            });

            mockPostgres.mockReturnValue(mockClient);

            const poolConfig = { max: 10, idleTimeout: 20 };
            const retryConfig = {
                maxRetries: 3,
                initialDelay: 10,
                maxDelay: 1000,
                factor: 2,
            };

            await createDatabaseConnection(
                'postgresql://test:test@localhost:5432/test',
                poolConfig,
                retryConfig
            );

            expect(callCount).toBe(2);
        });
    });

    describe('checkConnection', () =>
    {
        it('should return true for healthy connection', async () =>
        {
            const mockClient: any = vi.fn((sql: TemplateStringsArray) =>
                Promise.resolve([{ health_check: 1 }])
            );

            const result = await checkConnection(mockClient);

            expect(result).toBe(true);
            expect(mockClient).toHaveBeenCalledWith(['SELECT 1 as health_check']);
        });

        it('should return false for failed connection', async () =>
        {
            const mockClient: any = vi.fn(() =>
                Promise.reject(new Error('Connection failed'))
            );

            const result = await checkConnection(mockClient);

            expect(result).toBe(false);
        });

        it('should handle various error types', async () =>
        {
            const mockClient: any = vi.fn(() =>
                Promise.reject('String error')
            );

            const result = await checkConnection(mockClient);

            expect(result).toBe(false);
        });
    });
});