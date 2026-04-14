/**
 * Health Check Unit Tests
 *
 * Tests database health check and automatic reconnection.
 * Uses fake timers to test interval-based checks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startHealthCheck, stopHealthCheck, triggerForceReconnect } from '../health-check';

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
    getWriteClient: vi.fn(() => undefined),
    getReadClient: vi.fn(() => undefined),
    setWriteClient: vi.fn(),
    setReadClient: vi.fn(),
    getMonitoringConfig: vi.fn(() => undefined),
    setMonitoringConfig: vi.fn(),
    getInitOptions: vi.fn(() => undefined),
    getIsClosing: vi.fn(() => false),
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

            startHealthCheck(config, undefined, getDatabase);

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

            // Mock existing interval
            const { getHealthCheckInterval, setHealthCheckInterval } = await import('../global-state');
            vi.mocked(getHealthCheckInterval).mockReturnValueOnce({} as any);

            startHealthCheck(config, undefined, getDatabase);

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

            startHealthCheck(config, undefined, getDatabase);

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

            startHealthCheck(config, undefined, getDatabase);

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

            startHealthCheck(config, undefined, getDatabase);

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

            startHealthCheck(config, undefined, getDatabase);

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

            startHealthCheck(config, undefined, getDatabase);

            await vi.advanceTimersByTimeAsync(60000);

            const { createDatabaseFromEnv } = await import('../factory');
            expect(createDatabaseFromEnv).not.toHaveBeenCalled();
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

            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockResolvedValue({
                write: { execute: vi.fn(async () => {}) } as any,
                read: { execute: vi.fn(async () => {}) } as any,
                writeClient: { end: vi.fn(async () => {}) } as any,
                readClient: { end: vi.fn(async () => {}) } as any,
            });

            startHealthCheck(config, undefined, getDatabase);

            await vi.advanceTimersByTimeAsync(10000);
            await vi.advanceTimersByTimeAsync(5000);

            expect(createDatabaseFromEnv).toHaveBeenCalled();

            const { setWriteInstance } = await import('../global-state');
            expect(setWriteInstance).toHaveBeenCalled();
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

            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockRejectedValue(
                new Error('Reconnection failed')
            );

            startHealthCheck(config, undefined, getDatabase);

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

            startHealthCheck(config, undefined, getDatabase);

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

            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockResolvedValue({
                write: undefined,
                read: undefined,
            });

            startHealthCheck(config, undefined, getDatabase);

            await vi.advanceTimersByTimeAsync(10000);
            await vi.advanceTimersByTimeAsync(1000);

            // Should not set instances when write is undefined
            const { setWriteInstance } = await import('../global-state');
            expect(setWriteInstance).not.toHaveBeenCalled();
        });

        it('should skip health check while reconnecting', async () =>
        {
            const config = {
                enabled: true,
                interval: 5000,
                reconnect: true,
                maxRetries: 3,
                retryInterval: 3000,
            };

            const mockDb = {
                execute: vi.fn(async () => {
                    throw new Error('Health check failed');
                }),
            };

            const getDatabase = vi.fn(() => mockDb) as any;

            const { createDatabaseFromEnv } = await import('../factory');
            // Make reconnection slow (takes multiple intervals)
            vi.mocked(createDatabaseFromEnv).mockImplementation(async () =>
            {
                // Simulate slow reconnection
                await new Promise(resolve => setTimeout(resolve, 2000));
                throw new Error('Reconnection failed');
            });

            startHealthCheck(config, undefined, getDatabase);

            // First health check triggers reconnection
            await vi.advanceTimersByTimeAsync(5000);

            // Second health check fires while reconnecting - should be skipped
            await vi.advanceTimersByTimeAsync(5000);

            // Only one reconnection cycle should be active
            // (getDatabase called 2 times for first health check: write + read,
            //  but not called again for second interval due to isReconnecting)
            expect(getDatabase).toHaveBeenCalledTimes(2);
        });

        it('should continue health checks after reconnection failure', async () =>
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

            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockRejectedValue(
                new Error('Reconnection failed')
            );

            startHealthCheck(config, undefined, getDatabase);

            // First health check + reconnection attempt
            await vi.advanceTimersByTimeAsync(10000);
            await vi.advanceTimersByTimeAsync(1000);

            expect(createDatabaseFromEnv).toHaveBeenCalledTimes(1);

            // Second health check should still fire (interval not stopped)
            await vi.advanceTimersByTimeAsync(10000);
            await vi.advanceTimersByTimeAsync(1000);

            expect(createDatabaseFromEnv).toHaveBeenCalledTimes(2);
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
            vi.mocked(getHealthCheckInterval).mockReturnValue(undefined);

            stopHealthCheck();

            expect(setHealthCheckInterval).not.toHaveBeenCalled();
        });
    });

    // ========================================================================
    // triggerForceReconnect — guards + coalescing
    // ========================================================================

    describe('triggerForceReconnect', () =>
    {
        it('returns false and does nothing if DB is not initialized', async () =>
        {
            const { getWriteInstance, getIsClosing } = await import('../global-state');
            const { createDatabaseFromEnv } = await import('../factory');

            // Fresh process: no write instance yet.
            vi.mocked(getWriteInstance).mockReturnValue(undefined);
            vi.mocked(getIsClosing).mockReturnValue(false);

            await expect(triggerForceReconnect('manual')).resolves.toBe(false);
            expect(createDatabaseFromEnv).not.toHaveBeenCalled();
        });

        it('returns false if closeDatabase is in progress', async () =>
        {
            const { getWriteInstance, getIsClosing } = await import('../global-state');
            const { createDatabaseFromEnv } = await import('../factory');

            vi.mocked(getWriteInstance).mockReturnValue({ execute: vi.fn() } as any);
            vi.mocked(getIsClosing).mockReturnValue(true);

            await expect(triggerForceReconnect('manual')).resolves.toBe(false);
            expect(createDatabaseFromEnv).not.toHaveBeenCalled();
        });

        it('runs a full reconnect cycle on happy path', async () =>
        {
            const { getWriteInstance, getIsClosing, setWriteInstance } = await import('../global-state');
            const { createDatabaseFromEnv } = await import('../factory');

            vi.mocked(getWriteInstance).mockReturnValue({ execute: vi.fn() } as any);
            vi.mocked(getIsClosing).mockReturnValue(false);
            vi.mocked(createDatabaseFromEnv).mockResolvedValue({
                write: { execute: vi.fn(async () => {}) } as any,
                read: { execute: vi.fn(async () => {}) } as any,
                writeClient: { end: vi.fn(async () => {}) } as any,
                readClient: { end: vi.fn(async () => {}) } as any,
            });

            const result = await triggerForceReconnect('manual');

            expect(result).toBe(true);
            expect(createDatabaseFromEnv).toHaveBeenCalledTimes(1);
            expect(setWriteInstance).toHaveBeenCalled();
        });

        it('coalesces concurrent callers — only one rebuild runs', async () =>
        {
            const { getWriteInstance, getIsClosing } = await import('../global-state');
            const { createDatabaseFromEnv } = await import('../factory');

            vi.mocked(getWriteInstance).mockReturnValue({ execute: vi.fn() } as any);
            vi.mocked(getIsClosing).mockReturnValue(false);

            // Make the rebuild slow so both callers overlap.
            vi.mocked(createDatabaseFromEnv).mockImplementation(async () =>
            {
                await new Promise(resolve => setTimeout(resolve, 2000));
                return {
                    write: { execute: vi.fn(async () => {}) } as any,
                    read: { execute: vi.fn(async () => {}) } as any,
                    writeClient: { end: vi.fn(async () => {}) } as any,
                    readClient: { end: vi.fn(async () => {}) } as any,
                };
            });

            const first = triggerForceReconnect('caller_a');
            const second = triggerForceReconnect('caller_b');

            await vi.advanceTimersByTimeAsync(3000);

            const [firstResult, secondResult] = await Promise.all([first, second]);

            // Exactly one of them actually ran the loop.
            expect([firstResult, secondResult].filter(Boolean)).toHaveLength(1);
            expect(createDatabaseFromEnv).toHaveBeenCalledTimes(1);
        });

        it('aborts before swap if isClosing flips during rebuild', async () =>
        {
            const {
                getWriteInstance,
                getIsClosing,
                setWriteInstance,
                getInitOptions,
            } = await import('../global-state');
            const { createDatabaseFromEnv } = await import('../factory');

            vi.mocked(getWriteInstance).mockReturnValue({ execute: vi.fn() } as any);

            // Single-attempt retry loop so the test doesn't wait on the retry
            // timer when reconnectAndRestore returns false.
            vi.mocked(getInitOptions).mockReturnValue({
                healthCheck: { maxRetries: 1, retryInterval: 1 },
            });

            // Entry checks → false. The swap-time check → true (close started
            // while createDatabaseFromEnv was running).
            vi.mocked(getIsClosing)
                .mockReturnValueOnce(false)  // triggerForceReconnect entry
                .mockReturnValueOnce(false)  // reconnectAndRestore entry
                .mockReturnValue(true);      // post-await check → bail

            const writeEnd = vi.fn(async () => {});
            const readEnd = vi.fn(async () => {});
            vi.mocked(createDatabaseFromEnv).mockResolvedValue({
                write: { execute: vi.fn(async () => {}) } as any,
                read: { execute: vi.fn(async () => {}) } as any,
                writeClient: { end: writeEnd } as any,
                readClient: { end: readEnd } as any,
            });

            const resultPromise = triggerForceReconnect('manual');
            await vi.runAllTimersAsync();
            await resultPromise;

            // Newly-created clients must be torn down, NOT swapped into globalThis.
            expect(writeEnd).toHaveBeenCalled();
            expect(setWriteInstance).not.toHaveBeenCalled();
        });
    });
});
