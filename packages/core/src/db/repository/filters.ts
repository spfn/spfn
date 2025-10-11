/**
 * Repository Filter Utilities
 *
 * Utilities for building Drizzle ORM WHERE, ORDER BY, and pagination conditions.
 * Moved from deprecated query module for Repository pattern usage.
 *
 * @module db/repository/filters
 */

import { and, eq, ne, gt, gte, lt, lte, like, inArray, notInArray, isNull, isNotNull, or, asc, desc, sql, SQL } from 'drizzle-orm';

import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

// ============================================================================
// Types
// ============================================================================

/**
 * Filter operators
 */
export type FilterOperator =
  | 'eq'      // equals
  | 'ne'      // not equals
  | 'gt'      // greater than
  | 'gte'     // greater than or equal
  | 'lt'      // less than
  | 'lte'     // less than or equal
  | 'like'    // LIKE (partial match)
  | 'in'      // IN (array)
  | 'nin'     // NOT IN (array)
  | 'is';     // IS NULL / IS NOT NULL

/**
 * Filter value type
 */
export type FilterValue = string | number | boolean | null | (string | number)[];

/**
 * Filter condition
 *
 * @example { email: { eq: 'john@example.com' } }
 * @example { age: { gte: 18, lte: 65 } }
 */
export type FilterCondition = {
  [operator in FilterOperator]?: FilterValue;
};

/**
 * Complete filters
 *
 * @example { email: { eq: 'john@example.com' }, role: { in: ['admin', 'user'] } }
 */
export type Filters = {
  [field: string]: FilterCondition;
};

/**
 * Filter builder result type
 */
export type FilterResult = SQL<unknown> | undefined;

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort condition
 *
 * @example [{ field: 'createdAt', direction: 'desc' }, { field: 'name', direction: 'asc' }]
 */
export type SortCondition = {
  field: string;
  direction: SortDirection;
};

/**
 * Sort builder result type
 */
export type SortResult = SQL<unknown>[];

/**
 * Pagination parameters
 */
export type PaginationParams = {
  page: number;
  limit: number;
};

/**
 * Pagination metadata
 */
export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

/**
 * Drizzle table type (generic)
 */
export type DrizzleTable = PgTable<any> & Record<string, PgColumn>;

// ============================================================================
// Filter Builder
// ============================================================================

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

// ============================================================================
// Sort Builder
// ============================================================================

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

// ============================================================================
// Pagination Utilities
// ============================================================================

/**
 * Apply pagination to Drizzle query
 *
 * @param pagination - Pagination parameters
 * @returns { offset, limit } object
 *
 * @example
 * const { offset, limit } = applyPagination({ page: 2, limit: 20 });
 * const data = await db.select().from(users).limit(limit).offset(offset);
 */
export function applyPagination(pagination: PaginationParams)
{
    const { page, limit } = pagination;
    const offset = (page - 1) * limit;

    return { offset, limit };
}

/**
 * Create pagination metadata
 *
 * @param pagination - Pagination parameters
 * @param total - Total count
 * @returns Pagination metadata
 *
 * @example
 * const meta = createPaginationMeta({ page: 2, limit: 20 }, 156);
 * // { page: 2, limit: 20, total: 156, totalPages: 8, hasNext: true, hasPrev: true }
 */
export function createPaginationMeta(
    pagination: PaginationParams,
    total: number
): PaginationMeta
{
    const { page, limit } = pagination;
    const totalPages = Math.ceil(total / limit);

    return {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
    };
}

/**
 * Count total records (count query)
 *
 * @param db - Drizzle DB instance
 * @param table - Table schema
 * @param whereCondition - WHERE condition (optional)
 * @returns Total count
 *
 * @example
 * const total = await countTotal(db, users);
 * const total = await countTotal(db, users, eq(users.status, 'active'));
 */
export async function countTotal(
    db: PostgresJsDatabase<Record<string, never>>,
    table: DrizzleTable,
    whereCondition?: any
): Promise<number>
{
    const query = db
        .select({ count: sql<number>`count(*)::int` })
        .from(table);

    if (whereCondition)
    {
        query.where(whereCondition);
    }

    const [result] = await query;
    return result?.count || 0;
}