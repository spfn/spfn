/**
 * Filter Builder
 *
 * Utility to dynamically build Drizzle ORM WHERE conditions
 *
 * 📝 TODO: See improvements.md
 * - #8: OR condition support ($or syntax for complex conditions)
 * - Nested filter support (AND/OR mixed conditions)
 * - Filter value validation (type checking and range validation)
 */

import { and, eq, ne, gt, gte, lt, lte, like, inArray, notInArray, isNull, isNotNull, or, SQL } from 'drizzle-orm';

import type { PgColumn } from 'drizzle-orm/pg-core';

import type { FilterOperator, Filters, FilterValue, DrizzleTable, FilterResult } from './types';

/**
 * Convert filter conditions to Drizzle SQL WHERE conditions
 *
 * @param filters - Parsed filter object
 * @param table - Drizzle table schema
 * @returns SQL WHERE condition (undefined if no filters)
 *
 * @example
 * const filters = { email: { eq: 'john@example.com' }, age: { gte: 18 } };
 * const condition = buildFilters(filters, users);
 * const data = await db.select().from(users).where(condition);
 */
export function buildFilters(
    filters: Filters,
    table: DrizzleTable
): FilterResult
{
    const conditions: SQL<unknown>[] = [];

    for (const [field, filterCondition] of Object.entries(filters))
    {
        const column = table[field] as PgColumn;

        if (!column)
        {
            console.warn(`[buildFilters] Unknown field: ${field}`);
            continue;
        }

        // Build condition for each operator
        for (const [operator, value] of Object.entries(filterCondition))
        {
            const condition = buildCondition(column, operator as FilterOperator, value);
            if (condition)
            {
                conditions.push(condition);
            }
        }
    }

    // Combine all conditions with AND
    return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * Convert single filter condition to SQL condition
 */
function buildCondition(
    column: PgColumn,
    operator: FilterOperator,
    value: FilterValue
): SQL<unknown> | undefined
{
    switch (operator)
    {
        case 'eq':
            return eq(column, value as string | number);

        case 'ne':
            return ne(column, value as string | number);

        case 'gt':
            return gt(column, value as string | number);

        case 'gte':
            return gte(column, value as string | number);

        case 'lt':
            return lt(column, value as string | number);

        case 'lte':
            return lte(column, value as string | number);

        case 'like':
            return like(column, `%${value}%`);

        case 'in':
            if (Array.isArray(value))
            {
                return inArray(column, value);
            }
            console.warn(`[buildCondition] 'in' operator requires array value`);
            return undefined;

        case 'nin':
            if (Array.isArray(value))
            {
                return notInArray(column, value);
            }
            console.warn(`[buildCondition] 'nin' operator requires array value`);
            return undefined;

        case 'is':
            if (value === 'null') return isNull(column);
            if (value === 'notnull') return isNotNull(column);
            console.warn(`[buildCondition] 'is' operator requires 'null' or 'notnull'`);
            return undefined;

        default:
            console.warn(`[buildCondition] Unknown operator: ${operator}`);
            return undefined;
    }
}

/**
 * Combine conditions with OR
 *
 * @example
 * const conditions = [
 *   buildFilters({ status: { eq: 'active' } }, users),
 *   buildFilters({ role: { eq: 'admin' } }, users)
 * ];
 * const orCondition = orFilters(...conditions);
 */
export function orFilters(...conditions: (FilterResult)[]): FilterResult
{
    const validConditions = conditions.filter(c => c !== undefined) as SQL<unknown>[];
    return validConditions.length > 0 ? or(...validConditions) : undefined;
}