/**
 * Global Database instance manager
 * Provides singleton access to database across all modules
 * Supports Primary + Replica pattern with separate read/write instances
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';

import { createDatabaseFromEnv, type DatabaseOptions } from './factory.js';
import { logger } from '../../logger/index.js';

const dbLogger = logger.child('database');

let writeInstance: PostgresJsDatabase | undefined;
let readInstance: PostgresJsDatabase | undefined;
let writeClient: Sql | undefined;
let readClient: Sql | undefined;

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
 * - DB_POOL_MAX (connection pool max size)
 * - DB_POOL_IDLE_TIMEOUT (connection idle timeout in seconds)
 *
 * Configuration priority:
 * 1. options parameter (ServerConfig)
 * 2. Environment variables
 * 3. Defaults (based on NODE_ENV)
 *
 * @param options - Optional database configuration (pool settings, etc.)
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
 *
 * @example
 * ```typescript
 * // Custom pool configuration
 * const { write, read } = await initDatabase({
 *   pool: { max: 50, idleTimeout: 60 }
 * });
 * ```
 */
export async function initDatabase(options?: DatabaseOptions): Promise<{
    write?: PostgresJsDatabase;
    read?: PostgresJsDatabase;
}>
{
    // Already initialized
    if (writeInstance)
    {
        dbLogger.debug('Database already initialized');
        return { write: writeInstance, read: readInstance };
    }

    // Auto-detect from environment
    const result = await createDatabaseFromEnv(options);

    if (result.write)
    {
        try
        {
            // Test connection with a simple query
            await result.write.execute('SELECT 1');

            // Test read instance if different
            if (result.read && result.read !== result.write)
            {
                await result.read.execute('SELECT 1');
            }

            // Store instances
            writeInstance = result.write;
            readInstance = result.read;
            writeClient = result.writeClient;
            readClient = result.readClient;

            const hasReplica = result.read && result.read !== result.write;
            dbLogger.info(
                hasReplica
                    ? 'Database connected (Primary + Replica)'
                    : 'Database connected'
            );
        }
        catch (error)
        {
            const message = error instanceof Error ? error.message : 'Unknown error';
            dbLogger.error('Database connection failed', { error: message });

            // Cleanup on failure
            await closeDatabase();

            return { write: undefined, read: undefined };
        }
    }
    else
    {
        dbLogger.warn('No database configuration found');
        dbLogger.warn('Set DATABASE_URL environment variable to enable database');
    }

    return { write: writeInstance, read: readInstance };
}

/**
 * Close all database connections and cleanup
 *
 * Properly closes postgres connection pools with timeout.
 * Should be called during graceful shutdown or after tests.
 *
 * @example
 * ```typescript
 * import { closeDatabase } from '@spfn/core/db';
 *
 * // During graceful shutdown
 * process.on('SIGTERM', async () => {
 *     await closeDatabase();
 *     process.exit(0);
 * });
 *
 * // In tests
 * afterAll(async () => {
 *     await closeDatabase();
 * });
 * ```
 */
export async function closeDatabase(): Promise<void>
{
    if (!writeInstance && !readInstance)
    {
        dbLogger.debug('No database connections to close');
        return;
    }

    try
    {
        const closePromises: Promise<void>[] = [];

        // Close write client
        if (writeClient)
        {
            dbLogger.debug('Closing write connection...');
            closePromises.push(
                writeClient.end({ timeout: 5 })
                    .then(() => dbLogger.debug('Write connection closed'))
                    .catch(err => dbLogger.error('Error closing write connection', err))
            );
        }

        // Close read client (if different from write)
        if (readClient && readClient !== writeClient)
        {
            dbLogger.debug('Closing read connection...');
            closePromises.push(
                readClient.end({ timeout: 5 })
                    .then(() => dbLogger.debug('Read connection closed'))
                    .catch(err => dbLogger.error('Error closing read connection', err))
            );
        }

        // Wait for all connections to close
        await Promise.all(closePromises);

        dbLogger.info('All database connections closed');
    }
    catch (error)
    {
        dbLogger.error('Error during database cleanup', error as Error);
        throw error;
    }
    finally
    {
        // Always clear instances
        writeInstance = undefined;
        readInstance = undefined;
        writeClient = undefined;
        readClient = undefined;
    }
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