/**
 * Health Check Unit Tests
 *
 * Tests database health check and automatic reconnection.
 * Uses fake timers to test interval-based checks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startHealthCheck, stopHealthCheck } from '../health-check';

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

// Mock factory
vi.mock('../factory', () => ({
    createDatabaseFromEnv: vi.fn(async () => ({
        write: { execute: vi.fn(async () => {}) },
        read: { execute: vi.fn(async () => {}) },
        writeClient: { end: vi.fn(async () => {}) },
        readClient: { end: vi.fn(async () => {}) },
    })),
}));

// Mock global-state
vi.mock('../global-state', () => ({
    getHealthCheckInterval: vi.fn(() => null),
    setHealthCheckInterval: vi.fn(),
    getWriteInstance: vi.fn(() => undefined),
    setWriteInstance: vi.fn(),
    setReadInstance: vi.fn(),
    setWriteClient: vi.fn(),
    setReadClient: vi.fn(),
    getMonitoringConfig: vi.fn(() => undefined),
    setMonitoringConfig: vi.fn(),
}));

describe('Database Health Check', () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() =>
    {
        vi.restoreAllMocks();
        vi.useRealTimers();
        stopHealthCheck();
    });

    describe('startHealthCheck', () =>
    {
        it('should start health check interval', async () =>
        {
            const config = {
                enabled: true,
                interval: 60000,
                reconnect: false,
                maxRetries: 3,
                retryInterval: 5000,
            };

            const getDatabase = vi.fn(() => ({
                execute: vi.fn(async () => {}),
            })) as any;

            const closeDatabase = vi.fn(async () => {});

            startHealthCheck(config, undefined, getDatabase, closeDatabase);

            const { setHealthCheckInterval } = await import('../global-state');
            expect(setHealthCheckInterval).toHaveBeenCalledWith(expect.any(Object));
        });

        it('should not start if already running', async () =>
        {
            const config = {
                enabled: true,
                interval: 60000,
                reconnect: false,
                maxRetries: 3,
                retryInterval: 5000,
            };

            const getDatabase = vi.fn(() => ({
                execute: vi.fn(async () => {}),
            })) as any;

            const closeDatabase = vi.fn(async () => {});

            // Mock existing interval
            const { getHealthCheckInterval, setHealthCheckInterval } = await import('../global-state');
            vi.mocked(getHealthCheckInterval).mockReturnValueOnce({} as any);

            startHealthCheck(config, undefined, getDatabase, closeDatabase);

            expect(setHealthCheckInterval).not.toHaveBeenCalled();
        });

        it('should check write connection on interval', async () =>
        {
            const config = {
                enabled: true,
                interval: 60000,
                reconnect: false,
                maxRetries: 3,
                retryInterval: 5000,
            };

            const mockExecute = vi.fn(async () => {});
            const getDatabase = vi.fn(() => ({
                execute: mockExecute,
            })) as any;

            const closeDatabase = vi.fn(async () => {});

            startHealthCheck(config, undefined, getDatabase, closeDatabase);

            // Fast-forward to first interval
            await vi.advanceTimersByTimeAsync(60000);

            expect(getDatabase).toHaveBeenCalledWith('write');
            expect(mockExecute).toHaveBeenCalledWith('SELECT 1');
        });

        it('should check read connection when different from write', async () =>
        {
            const config = {
                enabled: true,
                interval: 60000,
                reconnect: false,
                maxRetries: 3,
                retryInterval: 5000,
            };

            const writeDb = { execute: vi.fn(async () => {}), _id: 'write' };
            const readDb = { execute: vi.fn(async () => {}), _id: 'read' };

            const getDatabase = vi.fn((type?: string) =>
            {
                if (type === 'write') return writeDb;
                if (type === 'read') return readDb;
                return writeDb;
            }) as any;

            const closeDatabase = vi.fn(async () => {});

            startHealthCheck(config, undefined, getDatabase, closeDatabase);

            await vi.advanceTimersByTimeAsync(60000);

            expect(writeDb.execute).toHaveBeenCalledWith('SELECT 1');
            expect(readDb.execute).toHaveBeenCalledWith('SELECT 1');
        });

        it('should not check read when same as write', async () =>
        {
            const config = {
                enabled: true,
                interval: 60000,
                reconnect: false,
                maxRetries: 3,
                retryInterval: 5000,
            };

            const mockDb = { execute: vi.fn(async () => {}), _id: 'db' };

            const getDatabase = vi.fn(() => mockDb) as any;

            const closeDatabase = vi.fn(async () => {});

            startHealthCheck(config, undefined, getDatabase, closeDatabase);

            await vi.advanceTimersByTimeAsync(60000);

            // Should only execute once (not twice for write+read)
            expect(mockDb.execute).toHaveBeenCalledTimes(1);
        });

        it('should handle null database', async () =>
        {
            const config = {
                enabled: true,
                interval: 60000,
                reconnect: false,
                maxRetries: 3,
                retryInterval: 5000,
            };

            const getDatabase = vi.fn(() => null) as any;
            const closeDatabase = vi.fn(async () => {});

            startHealthCheck(config, undefined, getDatabase, closeDatabase);

            await expect(
                vi.advanceTimersByTimeAsync(60000)
            ).resolves.not.toThrow();
        });

        it('should not attempt reconnection when reconnect=false', async () =>
        {
            const config = {
                enabled: true,
                interval: 60000,
                reconnect: false,
                maxRetries: 3,
                retryInterval: 5000,
            };

            const mockDb = {
                execute: vi.fn(async () => {
                    throw new Error('Health check failed');
                }),
            };

            const getDatabase = vi.fn(() => mockDb) as any;
            const closeDatabase = vi.fn(async () => {});

            startHealthCheck(config, undefined, getDatabase, closeDatabase);

            await vi.advanceTimersByTimeAsync(60000);

            expect(closeDatabase).not.toHaveBeenCalled();
        });

        it('should attempt reconnection when reconnect=true', async () =>
        {
            const config = {
                enabled: true,
                interval: 10000,
                reconnect: true,
                maxRetries: 2,
                retryInterval: 5000,
            };

            const mockDb = {
                execute: vi.fn(async () => {
                    throw new Error('Health check failed');
                }),
            };

            const getDatabase = vi.fn(() => mockDb) as any;
            const closeDatabase = vi.fn(async () => {});

            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockResolvedValue({
                write: { execute: vi.fn(async () => {}) } as any,
                read: { execute: vi.fn(async () => {}) } as any,
                writeClient: { end: vi.fn(async () => {}) } as any,
                readClient: { end: vi.fn(async () => {}) } as any,
            });

            startHealthCheck(config, undefined, getDatabase, closeDatabase);

            await vi.advanceTimersByTimeAsync(10000);
            await vi.advanceTimersByTimeAsync(5000);

            expect(closeDatabase).toHaveBeenCalled();
            expect(createDatabaseFromEnv).toHaveBeenCalled();
        });

        it('should retry reconnection up to maxRetries', async () =>
        {
            const config = {
                enabled: true,
                interval: 10000,
                reconnect: true,
                maxRetries: 3,
                retryInterval: 1000,
            };

            const mockDb = {
                execute: vi.fn(async () => {
                    throw new Error('Health check failed');
                }),
            };

            const getDatabase = vi.fn(() => mockDb) as any;
            const closeDatabase = vi.fn(async () => {});

            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockRejectedValue(
                new Error('Reconnection failed')
            );

            startHealthCheck(config, undefined, getDatabase, closeDatabase);

            await vi.advanceTimersByTimeAsync(10000);

            // Wait for all retry attempts
            for (let i = 0; i < 3; i++)
            {
                await vi.advanceTimersByTimeAsync(1000);
            }

            // Should attempt maxRetries times (3)
            expect(createDatabaseFromEnv).toHaveBeenCalledTimes(3);
        });

        it('should stop retrying after successful reconnection', async () =>
        {
            const config = {
                enabled: true,
                interval: 10000,
                reconnect: true,
                maxRetries: 3,
                retryInterval: 1000,
            };

            const mockDb = {
                execute: vi.fn(async () => {
                    throw new Error('Health check failed');
                }),
            };

            const { getWriteInstance } = await import('../global-state');

            // getDatabase should return failing DB initially, then successful DB after reconnection
            const getDatabase = vi.fn(() => {
                const currentWrite = getWriteInstance();
                return currentWrite || mockDb;
            }) as any;

            const closeDatabase = vi.fn(async () => {});

            const { createDatabaseFromEnv } = await import('../factory');
            let attempts = 0;
            const successDb = { execute: vi.fn(async () => {}) } as any;

            vi.mocked(createDatabaseFromEnv).mockImplementation(async () =>
            {
                attempts++;
                if (attempts === 2)
                {
                    // Succeed on second attempt
                    return {
                        write: successDb,
                        read: successDb,
                        writeClient: { end: vi.fn(async () => {}) } as any,
                        readClient: { end: vi.fn(async () => {}) } as any,
                    };
                }
                throw new Error('Reconnection failed');
            });

            startHealthCheck(config, undefined, getDatabase, closeDatabase);

            // Trigger first health check (fails, starts reconnection)
            await vi.advanceTimersByTimeAsync(10000);
            // Wait for retry interval
            await vi.advanceTimersByTimeAsync(1000);
            // Give time for async reconnection to complete
            await vi.advanceTimersByTimeAsync(100);

            // Should only attempt twice (fail, then succeed)
            expect(createDatabaseFromEnv).toHaveBeenCalledTimes(2);
        });

        it('should handle reconnection with no write instance', async () =>
        {
            const config = {
                enabled: true,
                interval: 10000,
                reconnect: true,
                maxRetries: 1,
                retryInterval: 1000,
            };

            const mockDb = {
                execute: vi.fn(async () => {
                    throw new Error('Health check failed');
                }),
            };

            const getDatabase = vi.fn(() => mockDb) as any;
            const closeDatabase = vi.fn(async () => {});

            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockResolvedValue({
                write: undefined,
                read: undefined,
            });

            startHealthCheck(config, undefined, getDatabase, closeDatabase);

            await vi.advanceTimersByTimeAsync(10000);
            await vi.advanceTimersByTimeAsync(1000);

            // Should not set instances when write is undefined
            const { setWriteInstance } = await import('../global-state');
            expect(setWriteInstance).not.toHaveBeenCalled();
        });
    });

    describe('stopHealthCheck', () =>
    {
        it('should clear interval when running', async () =>
        {
            const mockInterval = {} as any;

            const { getHealthCheckInterval, setHealthCheckInterval } = await import('../global-state');
            vi.mocked(getHealthCheckInterval).mockReturnValue(mockInterval);

            stopHealthCheck();

            expect(setHealthCheckInterval).toHaveBeenCalledWith(undefined);
        });

        it('should do nothing when not running', async () =>
        {
            const { getHealthCheckInterval, setHealthCheckInterval } = await import('../global-state');
            vi.mocked(getHealthCheckInterval).mockReturnValue(null);

            stopHealthCheck();

            expect(setHealthCheckInterval).not.toHaveBeenCalled();
        });
    });
});