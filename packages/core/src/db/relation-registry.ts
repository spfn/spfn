/**
 * Table Name Utilities
 *
 * Helper functions for extracting table names from Drizzle table objects.
 * Used by Repository for accessing db.query API with dynamic table names.
 */

import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * Table name cache for performance optimization
 * Prevents repeated Symbol.for lookups
 */
const tableNameCache = new WeakMap<PgTable, string>();

/**
 * Get table name from Drizzle table object
 *
 * Uses WeakMap cache to avoid repeated Symbol lookups for better performance.
 *
 * @param table - Drizzle table schema
 * @returns Table name string
 *
 * @example
 * ```typescript
 * import { users } from './schema';
 * const name = getTableName(users); // 'users'
 * ```
 */
export function getTableName(table: PgTable): string
{
    // Check cache first
    const cached = tableNameCache.get(table);
    if (cached)
    {
        return cached;
    }

    // Extract name from Drizzle table metadata
    // Drizzle stores table name in Symbol.for('drizzle:Name')
    const name = (table as any)[Symbol.for('drizzle:Name')] || table.constructor.name;

    // Cache for future lookups
    tableNameCache.set(table, name);

    return name;
}