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
    setDatabaseProvider,
    initDatabase,
    closeDatabase,
    getDatabaseInfo,
    getDatabaseMonitoringConfig,
    forceReconnectDatabase,
} from '../manager';

// Mock dependencies
vi.mock('../../../env', async (importOriginal) => 
{
    const actual = await importOriginal<typeof import('../../../env')>();

    return {
        ...actual,
        loadEnvironment: vi.fn(() => ({
            success: true,
            loaded: ['.env'],
        })),
    };
});

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
        write: { execute: vi.fn(async () => 
        {}), _type: 'write-db' },
        read: { execute: vi.fn(async () => 
        {}), _type: 'read-db' },
        writeClient: { end: vi.fn(async () => 
        {}), _type: 'write-client' },
        readClient: { end: vi.fn(async () => 
        {}), _type: 'read-client' },
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

        it('should reject environment initialization after manual registration', async () =>
        {
            const mockWrite: any = { _type: 'manual-write' };
            setDatabase(mockWrite);

            await expect(initDatabase()).rejects.toThrow('Database was registered manually');
            expect(getDatabase()).toBe(mockWrite);
        });

        it('should not replace an active external provider', async () =>
        {
            const close = vi.fn(async () =>
            {});
            const providerWrite: any = { execute: vi.fn(async () =>
            {}) };
            const manualWrite: any = { _type: 'manual-write' };

            await initDatabase({
                provider: { kind: 'test', write: providerWrite, close },
            });

            expect(() => setDatabase(manualWrite)).toThrow(
                'An external database provider is active',
            );
            expect(getDatabase()).toBe(providerWrite);

            await closeDatabase();
            expect(close).toHaveBeenCalledTimes(1);
        });
    });

    describe('database provider', () =>
    {
        it('should register write and read instances', () =>
        {
            const mockWrite: any = { _type: 'provider-write' };
            const mockRead: any = { _type: 'provider-read' };

            const result = setDatabaseProvider({
                kind: 'test',
                write: mockWrite,
                read: mockRead,
            });

            expect(result).toEqual({ write: mockWrite, read: mockRead });
            expect(getDatabase('write')).toBe(mockWrite);
            expect(getDatabase('read')).toBe(mockRead);
            expect(getDatabaseInfo().providerKind).toBe('test');
        });

        it('should initialize a provider without creating postgres.js clients', async () =>
        {
            const mockDb: any = { execute: vi.fn(async () =>
            {}) };

            await initDatabase({
                provider: {
                    kind: 'test',
                    write: mockDb,
                },
            });

            const { createDatabaseFromEnv } = await import('../factory');
            const { startHealthCheck } = await import('../health-check');
            expect(createDatabaseFromEnv).not.toHaveBeenCalled();
            expect(startHealthCheck).not.toHaveBeenCalled();
            expect(mockDb.execute).toHaveBeenCalledWith('SELECT 1');
        });

        it('should close an external provider exactly once', async () =>
        {
            const close = vi.fn(async () =>
            {});
            const mockDb: any = { execute: vi.fn(async () =>
            {}) };

            await initDatabase({
                provider: {
                    kind: 'test',
                    write: mockDb,
                    close,
                },
            });

            await Promise.all([closeDatabase(), closeDatabase()]);
            await closeDatabase();

            expect(close).toHaveBeenCalledTimes(1);
            expect(() => getDatabase()).toThrow('Database not initialized');
        });

        it('should make concurrent close callers wait for the same provider close', async () =>
        {
            let releaseClose: (() => void) | undefined;
            const closeBarrier = new Promise<void>((resolve) =>
            {
                releaseClose = resolve;
            });
            const close = vi.fn(() => closeBarrier);
            const mockDb: any = { execute: vi.fn(async () =>
            {}) };
            const provider = { kind: 'test', write: mockDb, close };

            await initDatabase({ provider });

            let secondCloseSettled = false;
            const firstClose = closeDatabase();
            const secondClose = closeDatabase().then(() =>
            {
                secondCloseSettled = true;
            });
            await Promise.resolve();
            await Promise.resolve();

            expect(close).toHaveBeenCalledTimes(1);
            expect(secondCloseSettled).toBe(false);
            expect(() => setDatabaseProvider(provider)).toThrow(
                'Cannot set database provider while closing',
            );
            expect(() => setDatabase({} as any)).toThrow('Cannot set database while closing');

            releaseClose!();
            await Promise.all([firstClose, secondClose]);
            expect(secondCloseSettled).toBe(true);
        });

        it('should absorb synchronous provider close errors and clear state', async () =>
        {
            const close = vi.fn(() =>
            {
                throw new Error('Synchronous close failed');
            });
            const mockDb: any = { execute: vi.fn(async () =>
            {}) };

            await initDatabase({ provider: { kind: 'test', write: mockDb, close } });

            await expect(closeDatabase()).resolves.not.toThrow();
            expect(close).toHaveBeenCalledTimes(1);
            expect(() => getDatabase()).toThrow('Database not initialized');
        });

        it('should skip postgres.js reconnect for an external provider', async () =>
        {
            const mockDb: any = { execute: vi.fn(async () =>
            {}) };
            await initDatabase({ provider: { kind: 'test', write: mockDb } });

            await expect(forceReconnectDatabase('test')).resolves.toBe(false);
        });

        it('should reject an empty provider kind', () =>
        {
            const mockDb: any = {};

            expect(() => setDatabaseProvider({ kind: '  ', write: mockDb })).toThrow(
                'Database provider kind must be a non-empty string',
            );
        });

        it('should close a provider rejected for an empty kind', async () =>
        {
            const close = vi.fn(async () =>
            {});
            const mockDb: any = { execute: vi.fn(async () =>
            {}) };

            await expect(initDatabase({
                provider: { kind: '  ', write: mockDb, close },
            })).rejects.toThrow('Database provider kind must be a non-empty string');

            expect(mockDb.execute).not.toHaveBeenCalled();
            expect(close).toHaveBeenCalledTimes(1);
            expect(() => getDatabase()).toThrow('Database not initialized');
        });

        it('should reject replacing an initialized database with a provider', async () =>
        {
            await initDatabase();
            const mockDb: any = { execute: vi.fn(async () =>
            {}) };

            expect(() => setDatabaseProvider({ kind: 'replacement', write: mockDb })).toThrow(
                'Database already initialized',
            );
            expect(getDatabaseInfo().providerKind).toBeUndefined();
        });

        it('should reject manual provider registration during environment initialization', async () =>
        {
            let releaseInitialization: (() => void) | undefined;
            const initializationBarrier = new Promise<void>((resolve) =>
            {
                releaseInitialization = resolve;
            });
            const environmentWrite: any = { execute: vi.fn(async () =>
            {}) };
            const environmentRead: any = { execute: vi.fn(async () =>
            {}) };
            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockImplementationOnce(async () =>
            {
                await initializationBarrier;

                return {
                    write: environmentWrite,
                    read: environmentRead,
                    writeClient: { end: vi.fn(async () =>
                    {}) } as any,
                    readClient: { end: vi.fn(async () =>
                    {}) } as any,
                };
            });
            const initialization = initDatabase();
            const providerDb: any = { execute: vi.fn(async () =>
            {}) };

            expect(() => setDatabaseProvider({ kind: 'provider', write: providerDb })).toThrow(
                'Cannot set database provider while initialization is in progress',
            );
            expect(() => setDatabase(providerDb)).toThrow(
                'Cannot set database while initialization is in progress',
            );

            releaseInitialization!();
            await initialization;
            expect(getDatabase()).toBe(environmentWrite);
            expect(getDatabaseInfo().providerKind).toBeUndefined();
        });

        it('should reject sequential initialization with a different provider', async () =>
        {
            const closeA = vi.fn(async () =>
            {});
            const mockA: any = { execute: vi.fn(async () =>
            {}) };
            const mockB: any = { execute: vi.fn(async () =>
            {}) };
            const providerA = { kind: 'a', write: mockA, close: closeA };
            const providerB = { kind: 'b', write: mockB };

            await initDatabase({ provider: providerA });

            await expect(initDatabase({ provider: providerB })).rejects.toThrow(
                'Database already initialized: a different provider was supplied',
            );
            expect(mockB.execute).not.toHaveBeenCalled();
            expect(getDatabase()).toBe(mockA);

            await closeDatabase();
            expect(closeA).toHaveBeenCalledTimes(1);
        });

        it('should reject concurrent initialization with a different provider', async () =>
        {
            let releaseInitialization: (() => void) | undefined;
            const initializationBarrier = new Promise<void>((resolve) =>
            {
                releaseInitialization = resolve;
            });
            const mockA: any = { execute: vi.fn(() => initializationBarrier) };
            const mockB: any = { execute: vi.fn(async () =>
            {}) };
            const providerA = { kind: 'a', write: mockA };
            const providerB = { kind: 'b', write: mockB };

            const firstInitialization = initDatabase({ provider: providerA });
            await expect(initDatabase({ provider: providerB })).rejects.toThrow(
                'Database initialization already in progress with a different provider',
            );
            expect(mockB.execute).not.toHaveBeenCalled();

            releaseInitialization!();
            await expect(firstInitialization).resolves.toEqual({ write: mockA, read: mockA });
        });

        it('should preserve a connection-test error when provider close throws synchronously', async () =>
        {
            const close = vi.fn(() =>
            {
                throw new Error('Close failed');
            });
            const mockDb: any = { execute: vi.fn(async () =>
            {
                throw new Error('Connection failed');
            }) };

            await expect(initDatabase({
                provider: { kind: 'test', write: mockDb, close },
            })).rejects.toThrow('Database connection test failed: Connection failed');
            expect(close).toHaveBeenCalledTimes(1);
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
                execute: vi.fn(async () => 
                {}),
            };

            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockResolvedValueOnce({
                write: mockWrite,
                read: mockWrite,
                writeClient: { end: vi.fn(async () => 
                {}) } as any,
                readClient: { end: vi.fn(async () => 
                {}) } as any,
            });

            await initDatabase();

            expect(mockWrite.execute).toHaveBeenCalledWith('SELECT 1');
        });

        it('should test read connection when different from write', async () =>
        {
            const mockWrite: any = { execute: vi.fn(async () => 
            {}) };
            const mockRead: any = { execute: vi.fn(async () => 
            {}) };

            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockResolvedValueOnce({
                write: mockWrite,
                read: mockRead,
                writeClient: { end: vi.fn(async () => 
                {}) } as any,
                readClient: { end: vi.fn(async () => 
                {}) } as any,
            });

            await initDatabase();

            expect(mockWrite.execute).toHaveBeenCalledWith('SELECT 1');
            expect(mockRead.execute).toHaveBeenCalledWith('SELECT 1');
        });

        it('should cleanup and throw on connection test failure', async () =>
        {
            const mockWrite: any = {
                execute: vi.fn(async () => 
                {
                    throw new Error('Connection test failed');
                }),
            };

            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockResolvedValueOnce({
                write: mockWrite,
                read: mockWrite,
                writeClient: { end: vi.fn(async () => 
                {}) } as any,
                readClient: { end: vi.fn(async () => 
                {}) } as any,
            });

            await expect(initDatabase()).rejects.toThrow(
                'Database connection test failed',
            );

            // Should cleanup on failure
            expect(() => getDatabase()).toThrow('Database not initialized');
        });

        it('should handle non-Error objects in connection test', async () =>
        {
            const mockWrite: any = {
                execute: vi.fn(async () => 
                {
                    throw 'String error';
                }),
            };

            const { createDatabaseFromEnv } = await import('../factory');
            vi.mocked(createDatabaseFromEnv).mockResolvedValueOnce({
                write: mockWrite,
                read: mockWrite,
                writeClient: { end: vi.fn(async () => 
                {}) } as any,
                readClient: { end: vi.fn(async () => 
                {}) } as any,
            });

            await expect(initDatabase()).rejects.toThrow(
                'Database connection test failed',
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

        it('should keep initialization blocked until an empty-state close settles', async () =>
        {
            const firstClose = closeDatabase();
            const mockDb: any = { execute: vi.fn(async () =>
            {}) };
            const provider = { kind: 'test', write: mockDb };

            await expect(initDatabase({ provider })).rejects.toThrow(
                'Cannot initialize database while closing',
            );
            const secondClose = closeDatabase();
            await Promise.all([firstClose, secondClose]);

            await expect(initDatabase({ provider })).resolves.toEqual({
                write: mockDb,
                read: mockDb,
            });
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
            const mockWriteClient = { end: vi.fn(async () => 
            {}) };

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
            const mockWriteClient = { end: vi.fn(async () => 
            {}) };
            const mockReadClient = { end: vi.fn(async () => 
            {}) };

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
                end: vi.fn(async () => 
                {
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
                end: vi.fn(async () => 
                {
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
