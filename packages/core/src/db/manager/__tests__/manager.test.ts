/**
 * Manager Unit Tests
 *
 * Tests global database instance manager functions.
 * Tests initialization, getter/setter, cleanup, and info functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getDatabase,
    setDatabase,
    initDatabase,
    closeDatabase,
    getDatabaseInfo,
    getDatabaseMonitoringConfig,
} from '../manager';

// Mock dependencies
vi.mock('../../../env', () => ({
    loadEnvironment: vi.fn(() => ({
        success: true,
        loaded: ['.env'],
    })),
    hasEnvVar: vi.fn((key: string) => !!process.env[key]),
    getEnvVar: vi.fn((key: string, options?: any) => {
        const value = process.env[key];
        if (value === undefined && options?.default !== undefined) {
            return options.default;
        }
        if (value === undefined && options?.required) {
            throw new Error(`Required environment variable ${key} is not set`);
        }
        if (value !== undefined && options?.validator) {
            try {
                return options.validator(value);
            } catch (error) {
                if (options?.default !== undefined) {
                    return options.default;
                }
                throw error;
            }
        }
        return value;
    }),
    getEnvVars: vi.fn((...keys: string[]) => {
        return keys.map(key => process.env[key]).filter((val): val is string => val !== undefined);
    }),
}));

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

vi.mock('../factory', () => ({
    createDatabaseFromEnv: vi.fn(async () => ({
        write: { execute: vi.fn(async () => {}), _type: 'write-db' },
        read: { execute: vi.fn(async () => {}), _type: 'read-db' },
        writeClient: { end: vi.fn(async () => {}), _type: 'write-client' },
        readClient: { end: vi.fn(async () => {}), _type: 'read-client' },
    })),
}));

vi.mock('../config', () => ({
    buildHealthCheckConfig: vi.fn(() => ({
        enabled: true,
        interval: 60000,
        reconnect: true,
        maxRetries: 3,
        retryInterval: 5000,
    })),
    buildMonitoringConfig: vi.fn(() => ({
        enabled: true,
        slowThreshold: 1000,
        logQueries: false,
    })),
}));

vi.mock('../health-check', () => ({
    startHealthCheck: vi.fn(),
    stopHealthCheck: vi.fn(),
}));

describe('Database Manager', () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks();
        // Clear global state
        setDatabase(undefined, undefined);
    });

    afterEach(async () =>
    {
        // Cleanup after each test
        try
        {
            await closeDatabase();
        }
        catch (e)
        {
            // Ignore cleanup errors
        }
        vi.restoreAllMocks();
    });

    describe('getDatabase', () =>
    {
        it('should throw when not initialized', () =>
        {
            expect(() => getDatabase()).toThrow('Database not initialized');
        });

        it('should return write instance by default', () =>
        {
            const mockWrite: any = { _type: 'write' };
            const mockRead: any = { _type: 'read' };

            setDatabase(mockWrite, mockRead);

            const db = getDatabase();
            expect(db).toBe(mockWrite);
        });

        it('should return write instance when type="write"', () =>
        {
            const mockWrite: any = { _type: 'write' };
            const mockRead: any = { _type: 'read' };

            setDatabase(mockWrite, mockRead);

            const db = getDatabase('write');
            expect(db).toBe(mockWrite);
        });

        it('should return read instance when type="read"', () =>
        {
            const mockWrite: any = { _type: 'write' };
            const mockRead: any = { _type: 'read' };

            setDatabase(mockWrite, mockRead);

            const db = getDatabase('read');
            expect(db).toBe(mockRead);
        });

        it('should fallback to write when read not set', () =>
        {
            const mockWrite: any = { _type: 'write' };

            setDatabase(mockWrite, undefined);

            const db = getDatabase('read');
            expect(db).toBe(mockWrite);
        });

        it('should throw when requesting read and nothing set', () =>
        {
            expect(() => getDatabase('read')).toThrow('Database not initialized');
        });
    });

    describe('setDatabase', () =>
    {
        it('should set write and read instances', () =>
        {
            const mockWrite: any = { _type: 'write' };
            const mockRead: any = { _type: 'read' };

            setDatabase(mockWrite, mockRead);

            expect(getDatabase('write')).toBe(mockWrite);
            expect(getDatabase('read')).toBe(mockRead);
        });

        it('should use write as read when read not provided', () =>
        {
            const mockWrite: any = { _type: 'write' };

            setDatabase(mockWrite);

            expect(getDatabase('write')).toBe(mockWrite);
            expect(getDatabase('read')).toBe(mockWrite);
        });

        it('should allow setting undefined', () =>
        {
            const mockWrite: any = { _type: 'write' };
            setDatabase(mockWrite);

            setDatabase(undefined, undefined);

            expect(() => getDatabase()).toThrow('Database not initialized');
        });

        it('should overwrite existing instances', () =>
        {
            const mockWrite1: any = { _type: 'write1' };
            const mockWrite2: any = { _type: 'write2' };

            setDatabase(mockWrite1);
            setDatabase(mockWrite2);

            expect(getDatabase()).toBe(mockWrite2);
        });
    });

    describe('initDatabase', () =>
    {
        it('should initialize database from environment', async () =>
        {
            const result = await initDatabase();

            expect(result.write).toBeDefined();
            expect(result.read).toBeDefined();
            expect(getDatabase('write')).toBe(result.write);
            expect(getDatabase('read')).toBe(result.read);
        });

        it('should return existing instance if already initialized', async () =>
        {
            const result1 = await initDatabase();
            const result2 = await initDatabase();

            expect(result1.write).toBe(result2.write);
            expect(result1.read).toBe(result2.read);

            const { createDatabaseFromEnv } = await import('../factory');
            // Should only call createDatabaseFromEnv once
            expect(createDatabaseFromEnv).toHaveBeenCalledTimes(1);
        });

        it('should start health check when enabled', async () =>
        {
            await initDatabase();

            const { startHealthCheck } = await import('../health-check');
            expect(startHealthCheck).toHaveBeenCalledTimes(1);
        });

        it('should not start health check when disabled', async () =>
        {
            const { buildHealthCheckConfig } = await import('../config');
            vi.mocked(buildHealthCheckConfig).mockReturnValueOnce({
                enabled: false,
                interval: 60000,
                reconnect: true,
                maxRetries: 3,
                retryInterval: 5000,
            });

            await initDatabase();

            const { startHealthCheck } = await import('../health-check');
            expect(startHealthCheck).not.toHaveBeenCalled();
        });

        it('should set monitoring config when enabled', async () =>
        {
            await initDatabase();

            const monConfig = getDatabaseMonitoringConfig();
            expect(monConfig).toBeDefined();
            expect(monConfig?.enabled).toBe(true);
        });

        it('should pass options to createDatabaseFromEnv', async () =>
        {
            const options = {
                pool: { max: 50, idleTimeout: 60 },
            };

            await initDatabase(options);

            const { createDatabaseFromEnv } = await import('../factory');
            expect(createDatabaseFromEnv).toHaveBeenCalledWith(options);
        });

        it('should test write connection', async () =>
        {
            const mockWrite: any = {
                execute: vi.fn(async () => {}),
            };

            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockResolvedValueOnce({
                write: mockWrite,
                read: mockWrite,
                writeClient: { end: vi.fn(async () => {}) } as any,
                readClient: { end: vi.fn(async () => {}) } as any,
            });

            await initDatabase();

            expect(mockWrite.execute).toHaveBeenCalledWith('SELECT 1');
        });

        it('should test read connection when different from write', async () =>
        {
            const mockWrite: any = { execute: vi.fn(async () => {}) };
            const mockRead: any = { execute: vi.fn(async () => {}) };

            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockResolvedValueOnce({
                write: mockWrite,
                read: mockRead,
                writeClient: { end: vi.fn(async () => {}) } as any,
                readClient: { end: vi.fn(async () => {}) } as any,
            });

            await initDatabase();

            expect(mockWrite.execute).toHaveBeenCalledWith('SELECT 1');
            expect(mockRead.execute).toHaveBeenCalledWith('SELECT 1');
        });

        it('should cleanup and throw on connection test failure', async () =>
        {
            const mockWrite: any = {
                execute: vi.fn(async () => {
                    throw new Error('Connection test failed');
                }),
            };

            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockResolvedValueOnce({
                write: mockWrite,
                read: mockWrite,
                writeClient: { end: vi.fn(async () => {}) } as any,
                readClient: { end: vi.fn(async () => {}) } as any,
            });

            await expect(initDatabase()).rejects.toThrow(
                'Database connection test failed'
            );

            // Should cleanup on failure
            expect(() => getDatabase()).toThrow('Database not initialized');
        });

        it('should handle non-Error objects in connection test', async () =>
        {
            const mockWrite: any = {
                execute: vi.fn(async () => {
                    throw 'String error';
                }),
            };

            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockResolvedValueOnce({
                write: mockWrite,
                read: mockWrite,
                writeClient: { end: vi.fn(async () => {}) } as any,
                readClient: { end: vi.fn(async () => {}) } as any,
            });

            await expect(initDatabase()).rejects.toThrow(
                'Database connection test failed'
            );
        });

        it('should warn when no database configuration found', async () =>
        {
            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockResolvedValueOnce({
                write: undefined,
                read: undefined,
            });

            const result = await initDatabase();

            expect(result.write).toBeUndefined();
            expect(result.read).toBeUndefined();
        });

        it('should support custom pool configuration', async () =>
        {
            await initDatabase({
                pool: { max: 100, idleTimeout: 120 },
            });

            const { createDatabaseFromEnv } = await import('../factory');
            expect(createDatabaseFromEnv).toHaveBeenCalledWith({
                pool: { max: 100, idleTimeout: 120 },
            });
        });

        it('should support custom health check configuration', async () =>
        {
            await initDatabase({
                healthCheck: { enabled: false },
            });

            const { buildHealthCheckConfig } = await import('../config');
            expect(buildHealthCheckConfig).toHaveBeenCalledWith({ enabled: false });
        });

        it('should support custom monitoring configuration', async () =>
        {
            await initDatabase({
                monitoring: { slowThreshold: 2000 },
            });

            const { buildMonitoringConfig } = await import('../config');
            expect(buildMonitoringConfig).toHaveBeenCalledWith({
                slowThreshold: 2000,
            });
        });
    });

    describe('closeDatabase', () =>
    {
        it('should close all connections', async () =>
        {
            await initDatabase();

            await closeDatabase();

            expect(() => getDatabase()).toThrow('Database not initialized');
        });

        it('should do nothing when no connections', async () =>
        {
            await expect(closeDatabase()).resolves.not.toThrow();
        });

        it('should stop health check', async () =>
        {
            await initDatabase();
            await closeDatabase();

            const { stopHealthCheck } = await import('../health-check');
            expect(stopHealthCheck).toHaveBeenCalled();
        });

        it('should close write client', async () =>
        {
            const mockWriteClient = { end: vi.fn(async () => {}) };

            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockResolvedValueOnce({
                write: { execute: vi.fn() } as any,
                read: { execute: vi.fn() } as any,
                writeClient: mockWriteClient as any,
                readClient: mockWriteClient as any,
            });

            await initDatabase();
            await closeDatabase();

            expect(mockWriteClient.end).toHaveBeenCalledWith({ timeout: 5 });
        });

        it('should close read client when different from write', async () =>
        {
            const mockWriteClient = { end: vi.fn(async () => {}) };
            const mockReadClient = { end: vi.fn(async () => {}) };

            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockResolvedValueOnce({
                write: { execute: vi.fn() } as any,
                read: { execute: vi.fn() } as any,
                writeClient: mockWriteClient as any,
                readClient: mockReadClient as any,
            });

            await initDatabase();
            await closeDatabase();

            expect(mockWriteClient.end).toHaveBeenCalledWith({ timeout: 5 });
            expect(mockReadClient.end).toHaveBeenCalledWith({ timeout: 5 });
        });

        it('should clear instances even if close fails', async () =>
        {
            const mockWriteClient = {
                end: vi.fn(async () => {
                    throw new Error('Close failed');
                }),
            };

            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockResolvedValueOnce({
                write: { execute: vi.fn() } as any,
                read: { execute: vi.fn() } as any,
                writeClient: mockWriteClient as any,
                readClient: mockWriteClient as any,
            });

            await initDatabase();

            // Should not throw - errors are caught
            await closeDatabase();

            // Instances should be cleared despite error
            expect(() => getDatabase()).toThrow('Database not initialized');
        });

        it('should handle error during cleanup', async () =>
        {
            const mockWriteClient = {
                end: vi.fn(async () => {
                    throw new Error('Cleanup error');
                }),
            };

            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockResolvedValueOnce({
                write: { execute: vi.fn() } as any,
                read: { execute: vi.fn() } as any,
                writeClient: mockWriteClient as any,
                readClient: mockWriteClient as any,
            });

            await initDatabase();

            // Should complete without throwing
            await closeDatabase();

            // State should be cleared
            expect(() => getDatabase()).toThrow('Database not initialized');
        });
    });

    describe('getDatabaseInfo', () =>
    {
        it('should return false when not initialized', () =>
        {
            const info = getDatabaseInfo();

            expect(info.hasWrite).toBe(false);
            expect(info.hasRead).toBe(false);
            expect(info.isReplica).toBe(false);
        });

        it('should return true for write when initialized', () =>
        {
            const mockWrite: any = { _type: 'write' };
            setDatabase(mockWrite);

            const info = getDatabaseInfo();

            expect(info.hasWrite).toBe(true);
            expect(info.hasRead).toBe(true);
            expect(info.isReplica).toBe(false);
        });

        it('should detect replica configuration', () =>
        {
            const mockWrite: any = { _type: 'write' };
            const mockRead: any = { _type: 'read' };

            setDatabase(mockWrite, mockRead);

            const info = getDatabaseInfo();

            expect(info.hasWrite).toBe(true);
            expect(info.hasRead).toBe(true);
            expect(info.isReplica).toBe(true);
        });

        it('should not detect replica when read equals write', () =>
        {
            const mockDb: any = { _type: 'db' };

            setDatabase(mockDb, mockDb);

            const info = getDatabaseInfo();

            expect(info.hasWrite).toBe(true);
            expect(info.hasRead).toBe(true);
            expect(info.isReplica).toBe(false);
        });
    });

    describe('getDatabaseMonitoringConfig', () =>
    {
        it('should return undefined when not initialized', () =>
        {
            const config = getDatabaseMonitoringConfig();
            expect(config).toBeUndefined();
        });

        it('should return monitoring config after initialization', async () =>
        {
            await initDatabase();

            const config = getDatabaseMonitoringConfig();

            expect(config).toBeDefined();
            expect(config?.enabled).toBe(true);
            expect(config?.slowThreshold).toBe(1000);
            expect(config?.logQueries).toBe(false);
        });

        it('should return undefined after close', async () =>
        {
            await initDatabase();
            await closeDatabase();

            const config = getDatabaseMonitoringConfig();
            expect(config).toBeUndefined();
        });
    });
});