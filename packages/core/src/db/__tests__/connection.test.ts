/**
 * Database Connection Tests
 *
 * Test database connection and connection pool functionality
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { createDatabaseConnection, checkConnection } from '@core/db/connection';
import type { PoolConfig, RetryConfig } from '@core/db/config';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL)
{
    throw new Error('DATABASE_URL environment variable is required for tests');
}

const poolConfig: PoolConfig = {
    max: 5,
    idleTimeout: 30,
};

const retryConfig: RetryConfig = {
    maxRetries: 2,
    initialDelay: 100,
    maxDelay: 1000,
    factor: 2,
};

describe('Database Connection', () =>
{
    let client: ReturnType<typeof postgres>;

    afterAll(async () =>
    {
        if (client)
        {
            await client.end();
        }
    });

    it('should connect to database successfully', async () =>
    {
        client = await createDatabaseConnection(DATABASE_URL, poolConfig, retryConfig);
        expect(client).toBeDefined();
    });

    it('should execute simple query', async () =>
    {
        if (!client)
        {
            client = await createDatabaseConnection(DATABASE_URL, poolConfig, retryConfig);
        }

        const [result] = await client`SELECT 1 as value`;
        expect(result.value).toBe(1);
    });

    it('should check connection health', async () =>
    {
        if (!client)
        {
            client = await createDatabaseConnection(DATABASE_URL, poolConfig, retryConfig);
        }

        const isHealthy = await checkConnection(client);
        expect(isHealthy).toBe(true);
    });

    it('should handle connection error gracefully', async () =>
    {
        const invalidUrl = 'postgresql://invalid:invalid@localhost:9999/invalid';

        await expect(
            createDatabaseConnection(invalidUrl, poolConfig, retryConfig)
        ).rejects.toThrow();
    });
});