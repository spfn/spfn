/**
 * Database factory with automatic environment variable detection
 * Supports: Single primary, Primary + Replica
 */

import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';

import { createDatabaseConnection } from './connection.js';
import { getPoolConfig, getRetryConfig } from './config.js';

export interface DatabaseClients
{
    /** Primary database for writes (or both read/write if no replica) */
    write?: PostgresJsDatabase;
    /** Replica database for reads (optional, falls back to write) */
    read?: PostgresJsDatabase;
    /** Raw postgres client for write operations (for cleanup) */
    writeClient?: Sql;
    /** Raw postgres client for read operations (for cleanup) */
    readClient?: Sql;
}

/**
 * Check if any database configuration exists in environment
 */
function hasDatabaseConfig(): boolean
{
    return !!(
        process.env.DATABASE_URL ||
        process.env.DATABASE_WRITE_URL ||
        process.env.DATABASE_READ_URL
    );
}

/**
 * Create database client(s) from environment variables
 *
 * Supported patterns (priority order):
 * 1. Single primary: DATABASE_URL
 * 2. Primary + Replica: DATABASE_WRITE_URL + DATABASE_READ_URL
 * 3. Legacy replica: DATABASE_URL + DATABASE_REPLICA_URL
 *
 * @returns Database client(s) or undefined if no configuration found
 *
 * @example
 * ```bash
 * # Single primary (most common)
 * DATABASE_URL=postgresql://localhost:5432/mydb
 *
 * # Primary + Replica
 * DATABASE_WRITE_URL=postgresql://primary:5432/mydb
 * DATABASE_READ_URL=postgresql://replica:5432/mydb
 *
 * # Legacy (backward compatibility)
 * DATABASE_URL=postgresql://primary:5432/mydb
 * DATABASE_REPLICA_URL=postgresql://replica:5432/mydb
 * ```
 */
export async function createDatabaseFromEnv(): Promise<DatabaseClients>
{
    // Load .env.local if needed
    if (!hasDatabaseConfig())
    {
        config({ path: '.env.local' });
    }

    // Quick exit if no database config
    if (!hasDatabaseConfig())
    {
        return { write: undefined, read: undefined };
    }

    try
    {
        const poolConfig = getPoolConfig();
        const retryConfig = getRetryConfig();

        // 1. Primary + Replica pattern (explicit separation)
        if (process.env.DATABASE_WRITE_URL && process.env.DATABASE_READ_URL)
        {
            const writeClient = await createDatabaseConnection(
                process.env.DATABASE_WRITE_URL,
                poolConfig,
                retryConfig
            );

            const readClient = await createDatabaseConnection(
                process.env.DATABASE_READ_URL,
                poolConfig,
                retryConfig
            );

            return {
                write: drizzle(writeClient),
                read: drizzle(readClient),
                writeClient,
                readClient,
            };
        }

        // 2. Legacy replica pattern (backward compatibility)
        if (process.env.DATABASE_URL && process.env.DATABASE_REPLICA_URL)
        {
            const writeClient = await createDatabaseConnection(
                process.env.DATABASE_URL,
                poolConfig,
                retryConfig
            );

            const readClient = await createDatabaseConnection(
                process.env.DATABASE_REPLICA_URL,
                poolConfig,
                retryConfig
            );

            return {
                write: drizzle(writeClient),
                read: drizzle(readClient),
                writeClient,
                readClient,
            };
        }

        // 3. Single primary (most common)
        if (process.env.DATABASE_URL)
        {
            const client = await createDatabaseConnection(
                process.env.DATABASE_URL,
                poolConfig,
                retryConfig
            );

            const db = drizzle(client);
            return {
                write: db,
                read: db,
                writeClient: client,
                readClient: client,
            };
        }

        // 4. DATABASE_WRITE_URL only (no read replica)
        if (process.env.DATABASE_WRITE_URL)
        {
            const client = await createDatabaseConnection(
                process.env.DATABASE_WRITE_URL,
                poolConfig,
                retryConfig
            );

            const db = drizzle(client);
            return {
                write: db,
                read: db,
                writeClient: client,
                readClient: client,
            };
        }

        // No valid configuration
        return { write: undefined, read: undefined };
    }
    catch (error)
    {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Failed to create database connection:', message);
        return { write: undefined, read: undefined };
    }
}