/**
 * Connection Unit Tests
 *
 * Tests database connection creation and health check functions.
 * Uses mocking to avoid real database connections.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDatabaseConnection, checkConnection } from '../connection';
import { ConnectionError } from '../../../errors';
import postgres from 'postgres';

// Mock postgres module (only mock needed to avoid real DB connections)
vi.mock('postgres', () => ({
    default: vi.fn(),
}));

describe('Database Connection', () =>
{
    const mockPostgres = vi.fn();

    beforeEach(() =>
    {
        vi.clearAllMocks();
        // Setup default postgres mock
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
            const mockClient: any = vi.fn((_sql: TemplateStringsArray) =>
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
                    connect_timeout: 10,
                }
            );

            expect(client).toBe(mockClient);
        });

        it('should retry on connection failure and succeed', async () =>
        {
            let callCount = 0;
            const mockClient: any = vi.fn((_sql: TemplateStringsArray) =>
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
                delays.push(delay);
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

            // First retry: 100ms with jitter (50-100ms), Second retry: 200ms with jitter (100-200ms)
            expect(delays.length).toBe(2);
            // Jitter: 0.5-1.0 multiplier, so 100 * (0.5-1.0) = 50-100
            expect(delays[0]).toBeGreaterThanOrEqual(50);
            expect(delays[0]).toBeLessThanOrEqual(100);
            // 200 * (0.5-1.0) = 100-200
            expect(delays[1]).toBeGreaterThanOrEqual(100);
            expect(delays[1]).toBeLessThanOrEqual(200);
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
                delays.push(delay);
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

            // First: 100ms with jitter (50-100ms), Second: 200ms with jitter (100-200ms), Third: 250ms with jitter (125-250ms, capped)
            expect(delays[0]).toBeGreaterThanOrEqual(50);
            expect(delays[0]).toBeLessThanOrEqual(100);
            expect(delays[1]).toBeGreaterThanOrEqual(100);
            expect(delays[1]).toBeLessThanOrEqual(200);
            expect(delays[2]).toBeGreaterThanOrEqual(125); // maxDelay 250 * 0.5
            expect(delays[2]).toBeLessThanOrEqual(250); // Capped at maxDelay
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
            const mockClient: any = vi.fn((_sql: TemplateStringsArray) =>
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