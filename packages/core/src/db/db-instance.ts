/**
 * Database Instance
 *
 * PostgreSQL + Drizzle ORM connection initialization and instance creation
 *
 * ✅ Implemented:
 * - PostgreSQL Connection Pool configuration
 * - Automatic environment variable loading (.env.local)
 * - DATABASE_URL validation
 * - Drizzle ORM instance creation
 * - Retry logic on connection failure (Exponential Backoff)
 * - Environment-specific Connection Pool configuration
 * - Read Replica support (read/write separation) - #11
 *
 * ⚠️ TODO:
 * - DB connection health check endpoint
 * - Connection pool monitoring (active/idle connections)
 * - Graceful Shutdown logic
 *
 * 💡 Future considerations:
 * - Connection Pool event logging
 * - Transaction isolation level configuration
 * - Query logging and performance monitoring
 */
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { createDatabaseConnection } from './connection.js';
import { getPoolConfig, getRetryConfig } from './config.js';

// Load environment variables (if not already loaded)
if (!process.env.DATABASE_URL)
{
    config({ path: '.env.local' });
}

// Read DATABASE_URL from environment variables
const primaryUrl = process.env.DATABASE_URL;
const replicaUrl = process.env.DATABASE_REPLICA_URL; // Optional

if (!primaryUrl)
{
    throw new Error('DATABASE_URL environment variable is not set');
}

// Connection Pool and retry configuration
const poolConfig = getPoolConfig();
const retryConfig = getRetryConfig();

// Primary connection (for writes)
let primaryClientPromise: ReturnType<typeof createDatabaseConnection> | null = null;

function getPrimaryClient()
{
    if (!primaryClientPromise)
    {
        primaryClientPromise = createDatabaseConnection(
            primaryUrl!,
            poolConfig,
            retryConfig
        );
    }
    return primaryClientPromise;
}

// Replica connection (for reads, optional)
let replicaClientPromise: ReturnType<typeof createDatabaseConnection> | null = null;

function getReplicaClient()
{
    if (!replicaUrl)
    {
        // Use Primary if no Replica URL
        return getPrimaryClient();
    }

    if (!replicaClientPromise)
    {
        replicaClientPromise = createDatabaseConnection(
            replicaUrl,
            poolConfig,
            retryConfig
        );
    }
    return replicaClientPromise;
}

// Initialize clients
const primaryClient = await getPrimaryClient();
const replicaClient = await getReplicaClient();

// Create Drizzle instances
const primaryDb = drizzle(primaryClient);
const replicaDb = drizzle(replicaClient);

/**
 * Default DB instance (Primary - for writes)
 */
export const db = primaryDb;

/**
 * DB connection type
 */
export type DbConnectionType = 'read' | 'write';

/**
 * Get raw Drizzle DB instance (direct use without transaction)
 *
 * ⚠️ Warning: This function bypasses AsyncLocalStorage transaction context.
 * For normal cases, use `getDb()` from './db-context.js'.
 *
 * @param type - 'read' (Replica) or 'write' (Primary)
 * @returns Raw Drizzle DB instance
 *
 * @example
 * // Read-only query (uses Replica)
 * const users = await getRawDb('read').select().from(users);
 *
 * // Write query (uses Primary)
 * await getRawDb('write').insert(users).values({ email: 'test@example.com' });
 */
export function getRawDb(type: DbConnectionType = 'write'): PostgresJsDatabase
{
    return type === 'read' ? replicaDb : primaryDb;
}