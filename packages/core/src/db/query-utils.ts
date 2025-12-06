/**
 * Query Utility Functions
 *
 * Common utilities for building database queries.
 * Used by both helpers.ts and repository.ts to avoid code duplication.
 *
 * @internal
 */

import type { SQL } from 'drizzle-orm';
import { eq, and } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * Check if value is a Drizzle SQL wrapper
 *
 * @param value - Value to check
 * @returns true if value is a SQL wrapper
 *
 * @internal
 */
export function isSQLWrapper(value: unknown): value is SQL
{
    return value !== null &&
           typeof value === 'object' &&
           'queryChunks' in value;
}

/**
 * Build SQL WHERE clause from plain object
 *
 * Converts an object like `{ id: 1, name: 'test' }` into
 * SQL condition `id = 1 AND name = 'test'`.
 *
 * @param table - Drizzle table schema
 * @param where - Object with column-value pairs
 * @returns SQL condition or undefined if no valid conditions
 *
 * @internal
 */
export function buildWhereFromObject<T extends PgTable>(
    table: T,
    where: Record<string, unknown>
): SQL | undefined
{
    const entries = Object.entries(where).filter(([_, value]) => value !== undefined);

    if (entries.length === 0)
    {
        return undefined;
    }

    const conditions = entries.map(([key, value]) =>
        eq((table as any)[key], value)
    );

    return conditions.length === 1 ? conditions[0] : and(...conditions);
}
