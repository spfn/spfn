/**
 * Global Database instance manager
 * Provides singleton access to database across all modules
 * Supports Primary + Replica pattern with separate read/write instances
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { createDatabaseFromEnv } from './db-factory.js';

let writeInstance: PostgresJsDatabase | undefined;
let readInstance: PostgresJsDatabase | undefined;

/**
 * DB connection type
 */
export type DbConnectionType = 'read' | 'write';

/**
 * Get global database write instance
 *
 * @returns Database write instance or undefined if not initialized
 *
 * @example
 * ```typescript
 * import { getDatabase } from '@spfn/core/db';
 *
 * const db = getDatabase();
 * if (db) {
 *   const users = await db.select().from(usersTable);
 * }
 * ```
 */
export function getDatabase(type?: DbConnectionType): PostgresJsDatabase | undefined
{
    if (type === 'read')
    {
        return readInstance ?? writeInstance;
    }
    return writeInstance;
}

/**
 * Set global database instances (for testing or manual configuration)
 *
 * @param write - Database write instance
 * @param read - Database read instance (optional, defaults to write)
 *
 * @example
 * ```typescript
 * import { setDatabase } from '@spfn/core/db';
 * import { drizzle } from 'drizzle-orm/postgres-js';
 * import postgres from 'postgres';
 *
 * const writeClient = postgres('postgresql://primary:5432/mydb');
 * const readClient = postgres('postgresql://replica:5432/mydb');
 * setDatabase(drizzle(writeClient), drizzle(readClient));
 * ```
 */
export function setDatabase(
    write: PostgresJsDatabase | undefined,
    read?: PostgresJsDatabase | undefined
): void
{
    writeInstance = write;
    readInstance = read ?? write;
}

/**
 * Initialize database from environment variables
 * Automatically called by server startup
 *
 * Supported environment variables:
 * - DATABASE_URL (single primary)
 * - DATABASE_WRITE_URL + DATABASE_READ_URL (primary + replica)
 * - DATABASE_URL + DATABASE_REPLICA_URL (legacy replica)
 *
 * @returns Object with write and read instances
 *
 * @example
 * ```typescript
 * import { initDatabase } from '@spfn/core/db';
 *
 * // Manual initialization (not needed if using server startup)
 * const { write, read } = await initDatabase();
 * if (write) {
 *   console.log('Database connected');
 * }
 * ```
 */
export async function initDatabase(): Promise<{
    write?: PostgresJsDatabase;
    read?: PostgresJsDatabase;
}>
{
    // Already initialized
    if (writeInstance)
    {
        return { write: writeInstance, read: readInstance };
    }

    // Auto-detect from environment
    const { write, read } = await createDatabaseFromEnv();

    if (write)
    {
        try
        {
            // Test connection with a simple query
            await write.execute('SELECT 1');

            // Test read instance if different
            if (read && read !== write)
            {
                await read.execute('SELECT 1');
            }

            writeInstance = write;
            readInstance = read;

            const hasReplica = read && read !== write;
            console.log(
                hasReplica
                    ? '✅ Database connected (Primary + Replica)'
                    : '✅ Database connected'
            );
        }
        catch (error)
        {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('❌ Database connection failed:', message);

            // Note: postgres-js doesn't need explicit cleanup like Redis
            // Connection pool will be cleaned up when process exits

            return { write: undefined, read: undefined };
        }
    }
    else
    {
        console.warn('⚠️  No database configuration found');
        console.warn('⚠️  Set DATABASE_URL environment variable to enable database');
    }

    return { write: writeInstance, read: readInstance };
}

/**
 * Close all database connections and cleanup
 * Note: postgres-js doesn't require explicit connection closing in most cases
 *
 * @example
 * ```typescript
 * import { closeDatabase } from '@spfn/core/db';
 *
 * // During graceful shutdown
 * await closeDatabase();
 * ```
 */
export async function closeDatabase(): Promise<void>
{
    // Note: postgres-js connections are managed automatically
    // This function is mainly for consistency with Redis pattern
    // and to allow future cleanup logic if needed

    writeInstance = undefined;
    readInstance = undefined;

    console.log('✅ Database instances cleared');
}

/**
 * Get database connection info (for debugging)
 */
export function getDatabaseInfo(): {
    hasWrite: boolean;
    hasRead: boolean;
    isReplica: boolean;
}
{
    return {
        hasWrite: !!writeInstance,
        hasRead: !!readInstance,
        isReplica: !!(readInstance && readInstance !== writeInstance),
    };
}