/**
 * Factory Unit Tests
 *
 * Tests database factory functions for environment detection and client creation.
 * Tests database configuration patterns: single, write-read.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDatabaseFromEnv } from '../factory';
import { createDatabaseConnection } from '../connection';

// Mock dependencies
vi.mock('drizzle-orm/postgres-js', () => ({
    drizzle: vi.fn((client) => ({ _client: client, _type: 'drizzle' })),
}));

vi.mock('../connection', () => ({
    createDatabaseConnection: vi.fn(async (url) => ({
        _url: url,
        _type: 'postgres-client',
    })),
}));

// Mock config module to use process.env directly
vi.mock('@spfn/core/config', () => ({
    env: new Proxy({}, {
        get: (_target, prop: string) => process.env[prop],
    }),
    registry: {
        reset: vi.fn(),
    },
}));

describe('Database Factory', () =>
{
    const originalEnv = { ...process.env };

    beforeEach(() =>
    {
        vi.clearAllMocks();
        process.env = { ...originalEnv };
        // Clear database env vars
        delete process.env.DATABASE_URL;
        delete process.env.DATABASE_WRITE_URL;
        delete process.env.DATABASE_READ_URL;
    });

    afterEach(() =>
    {
        process.env = originalEnv;
        vi.restoreAllMocks();
    });

    describe('createDatabaseFromEnv', () =>
    {
        describe('Pattern Detection', () =>
        {
            it('should detect write-read pattern (highest priority)', async () =>
            {
                process.env.DATABASE_WRITE_URL = 'postgresql://write:5432/db';
                process.env.DATABASE_READ_URL = 'postgresql://read:5432/db';

                const result = await createDatabaseFromEnv();

                expect(createDatabaseConnection).toHaveBeenCalledTimes(2);
                expect(createDatabaseConnection).toHaveBeenCalledWith(
                    'postgresql://write:5432/db',
                    expect.any(Object),
                    expect.any(Object),
                );
                expect(createDatabaseConnection).toHaveBeenCalledWith(
                    'postgresql://read:5432/db',
                    expect.any(Object),
                    expect.any(Object),
                );

                expect(result.write).toBeDefined();
                expect(result.read).toBeDefined();
                expect(result.writeClient).toBeDefined();
                expect(result.readClient).toBeDefined();
            });

            it('should detect single pattern with DATABASE_URL', async () =>
            {
                process.env.DATABASE_URL = 'postgresql://localhost:5432/db';

                const result = await createDatabaseFromEnv();

                expect(createDatabaseConnection).toHaveBeenCalledTimes(1);
                expect(createDatabaseConnection).toHaveBeenCalledWith(
                    'postgresql://localhost:5432/db',
                    expect.any(Object),
                    expect.any(Object),
                );

                expect(result.write).toBeDefined();
                expect(result.read).toBeDefined();
                expect(result.write).toBe(result.read);
                expect(result.writeClient).toBe(result.readClient);
            });

            it('should detect single pattern with DATABASE_WRITE_URL only', async () =>
            {
                process.env.DATABASE_WRITE_URL = 'postgresql://write:5432/db';

                const result = await createDatabaseFromEnv();

                expect(createDatabaseConnection).toHaveBeenCalledTimes(1);
                expect(createDatabaseConnection).toHaveBeenCalledWith(
                    'postgresql://write:5432/db',
                    expect.any(Object),
                    expect.any(Object),
                );

                expect(result.write).toBe(result.read);
            });

            it('should prioritize write-read over single pattern', async () =>
            {
                // Set both env vars - write-read should win
                process.env.DATABASE_URL = 'postgresql://primary:5432/db';
                process.env.DATABASE_WRITE_URL = 'postgresql://write:5432/db';
                process.env.DATABASE_READ_URL = 'postgresql://read:5432/db';

                await createDatabaseFromEnv();

                // Should use write-read pattern
                expect(createDatabaseConnection).toHaveBeenCalledWith(
                    'postgresql://write:5432/db',
                    expect.any(Object),
                    expect.any(Object),
                );
                expect(createDatabaseConnection).toHaveBeenCalledWith(
                    'postgresql://read:5432/db',
                    expect.any(Object),
                    expect.any(Object),
                );
            });
        });

        describe('Configuration Options', () =>
        {
            it('should pass custom pool config to connection', async () =>
            {
                process.env.DATABASE_URL = 'postgresql://localhost:5432/db';

                await createDatabaseFromEnv({
                    pool: { max: 50, idleTimeout: 60 },
                });

                expect(createDatabaseConnection).toHaveBeenCalledWith(
                    'postgresql://localhost:5432/db',
                    { max: 50, idleTimeout: 60 },
                    expect.any(Object),
                );
            });

            it('should use default config when options not provided', async () =>
            {
                process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
                process.env.NODE_ENV = 'production';

                await createDatabaseFromEnv();

                expect(createDatabaseConnection).toHaveBeenCalledWith(
                    'postgresql://localhost:5432/db',
                    { max: 20, idleTimeout: 30 },
                    expect.any(Object),
                );
            });

            it('should use partial pool config with env defaults', async () =>
            {
                process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
                process.env.NODE_ENV = 'production';
                process.env.DB_POOL_MAX = '100';

                await createDatabaseFromEnv({
                    pool: { idleTimeout: 45 },
                });

                expect(createDatabaseConnection).toHaveBeenCalledWith(
                    'postgresql://localhost:5432/db',
                    { max: 100, idleTimeout: 45 },
                    expect.any(Object),
                );
            });
        });

        describe('Error Handling', () =>
        {
            it('should throw error when connection fails', async () =>
            {
                process.env.DATABASE_URL = 'postgresql://localhost:5432/db';

                vi.mocked(createDatabaseConnection).mockRejectedValueOnce(
                    new Error('Connection failed'),
                );

                await expect(createDatabaseFromEnv()).rejects.toThrow(
                    'Database connection failed',
                );
            });

            it('should include error message in thrown error', async () =>
            {
                process.env.DATABASE_URL = 'postgresql://localhost:5432/db';

                vi.mocked(createDatabaseConnection).mockRejectedValueOnce(
                    new Error('Network timeout'),
                );

                await expect(createDatabaseFromEnv()).rejects.toThrow(
                    'Network timeout',
                );
            });

            it('should handle non-Error objects in catch block', async () =>
            {
                process.env.DATABASE_URL = 'postgresql://localhost:5432/db';

                vi.mocked(createDatabaseConnection).mockRejectedValueOnce(
                    'String error',
                );

                await expect(createDatabaseFromEnv()).rejects.toThrow(
                    'Database connection failed',
                );
            });
        });

        describe('Client Return Structure', () =>
        {
            it('should return all client objects for write-read pattern', async () =>
            {
                process.env.DATABASE_WRITE_URL = 'postgresql://write:5432/db';
                process.env.DATABASE_READ_URL = 'postgresql://read:5432/db';

                const result = await createDatabaseFromEnv();

                expect(result).toHaveProperty('write');
                expect(result).toHaveProperty('read');
                expect(result).toHaveProperty('writeClient');
                expect(result).toHaveProperty('readClient');
                expect(result.write).not.toBe(result.read);
                expect(result.writeClient).not.toBe(result.readClient);
            });

            it('should return same client for write and read in single pattern', async () =>
            {
                process.env.DATABASE_URL = 'postgresql://localhost:5432/db';

                const result = await createDatabaseFromEnv();

                expect(result.write).toBe(result.read);
                expect(result.writeClient).toBe(result.readClient);
            });
        });
    });
});
