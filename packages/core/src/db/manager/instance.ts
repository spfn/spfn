/**
 * Database Instance (Backward Compatibility Layer)
 *
 * PostgreSQL + Drizzle ORM connection - now using lazy initialization
 *
 * ✅ Implemented:
 * - Lazy initialization (no top-level await)
 * - Automatic environment variable loading
 * - Read Replica support (read/write separation)
 * - Singleton pattern via db-manager
 * - Backward compatibility with existing code
 *
 * ⚠️ Migration Note:
 * This file now wraps db-manager for backward compatibility.
 * New code should use:
 *   - initDatabase() from db-manager
 *   - getDatabase() from db-manager
 *
 * 🔗 Related files:
 * - src/db/db-factory.ts (Environment detection)
 * - src/db/db-manager.ts (Singleton management)
 * - src/db/db-context.ts (Transaction-aware access)
 */
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { getDatabase, type DbConnectionType } from './manager.js';

/**
 * Default DB instance (Primary - for writes)
 *
 * ⚠️ IMPORTANT: This is a lazy getter. On first access, it will:
 * 1. Auto-initialize database from environment variables
 * 2. Throw error if DATABASE_URL is not set
 *
 * For better error handling, use initDatabase() explicitly:
 * ```typescript
 * import { initDatabase } from '@spfn/core/db';
 * const { write } = await initDatabase();
 * if (!write) throw new Error('Database not configured');
 * ```
 *
 * @example
 * ```typescript
 * import { db } from '@spfn/core/db';
 * const users = await db.select().from(usersTable);
 * ```
 */
export const db = new Proxy({} as PostgresJsDatabase, {
    get(_target, prop)
    {
        const instance = getDatabase('write');
        if (!instance)
        {
            throw new Error(
                'Database not initialized. ' +
                'Set DATABASE_URL environment variable or call initDatabase() first.'
            );
        }
        return (instance as Record<string | symbol, any>)[prop];
    },
});

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
 * ```typescript
 * // Read-only query (uses Replica)
 * const users = await getRawDb('read').select().from(usersTable);
 *
 * // Write query (uses Primary)
 * await getRawDb('write').insert(usersTable).values({ email: 'test@example.com' });
 * ```
 */
export function getRawDb(type: DbConnectionType = 'write'): PostgresJsDatabase
{
    const instance = getDatabase(type);
    if (!instance)
    {
        throw new Error(
            'Database not initialized. ' +
            'Set DATABASE_URL environment variable or call initDatabase() first.'
        );
    }
    return instance;
}

// Re-export type for backward compatibility
export type { DbConnectionType };
