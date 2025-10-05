/**
 * Sort Builder
 *
 * Utility to dynamically build Drizzle ORM ORDER BY conditions
 */

import { asc, desc, SQL } from 'drizzle-orm';

import type { PgColumn } from 'drizzle-orm/pg-core';

import type { SortCondition, DrizzleTable, SortResult } from './types';

/**
 * Convert sort conditions to Drizzle SQL ORDER BY conditions
 *
 * @param sortConditions - Sort condition array
 * @param table - Drizzle table schema
 * @returns SQL ORDER BY condition array
 *
 * @example
 * const sort = [
 *   { field: 'createdAt', direction: 'desc' },
 *   { field: 'name', direction: 'asc' }
 * ];
 * const orderBy = buildSort(sort, users);
 * const data = await db.select().from(users).orderBy(...orderBy);
 */
export function buildSort(
    sortConditions: SortCondition[],
    table: DrizzleTable
): SortResult
{
    const orderByClauses: SQL<unknown>[] = [];

    for (const { field, direction } of sortConditions)
    {
        const column = table[field] as PgColumn;

        if (!column)
        {
            console.warn(`[buildSort] Unknown field: ${field}`);
            continue;
        }

        const clause = direction === 'desc' ? desc(column) : asc(column);
        orderByClauses.push(clause);
    }

    return orderByClauses;
}

/**
 * Parse sort conditions from query string
 *
 * @param sortQuery - Sort query string ('createdAt:desc,name:asc')
 * @param allowedFields - Allowed field list
 * @returns Sort condition array
 *
 * @example
 * const sort = parseSortQuery('createdAt:desc,name:asc', ['createdAt', 'name', 'email']);
 * // [{ field: 'createdAt', direction: 'desc' }, { field: 'name', direction: 'asc' }]
 */
export function parseSortQuery(
    sortQuery: string | undefined,
    allowedFields: string[] = []
): SortCondition[]
{
    if (!sortQuery) return [];

    const conditions: SortCondition[] = [];
    const sortParts = sortQuery.split(',');

    for (const part of sortParts)
    {
        const [field, direction = 'asc'] = part.trim().split(':');

        // Check if field is allowed
        if (allowedFields.length > 0 && !allowedFields.includes(field))
        {
            console.warn(`[parseSortQuery] Field '${field}' is not allowed`);
            continue;
        }

        // Check if direction is valid
        if (direction !== 'asc' && direction !== 'desc')
        {
            console.warn(`[parseSortQuery] Invalid direction '${direction}' for field '${field}'`);
            continue;
        }

        conditions.push({ field, direction });
    }

    return conditions;
}