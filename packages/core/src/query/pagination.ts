/**
 * Pagination Helper
 *
 * Pagination-related utilities
 */

import { sql } from 'drizzle-orm';

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { PaginationParams, PaginationMeta, DrizzleTable } from './types';

/**
 * Parse pagination from query parameters
 *
 * @param page - Page number (from query)
 * @param limit - Page size (from query)
 * @param options - Default/max configuration
 * @returns Pagination parameters
 *
 * @example
 * const pagination = parsePagination(
 *   c.query.page,
 *   c.query.limit,
 *   { default: 20, max: 100 }
 * );
 */
export function parsePagination(
    page: string | undefined,
    limit: string | undefined,
    options: { default?: number; max?: number } = {}
): PaginationParams
{
    const defaultLimit = options.default || 20;
    const maxLimit = options.max || 100;

    let parsedPage = parseInt(page || '1', 10);
    let parsedLimit = parseInt(limit || String(defaultLimit), 10);

    // Validation
    if (isNaN(parsedPage) || parsedPage < 1)
    {
        parsedPage = 1;
    }

    if (isNaN(parsedLimit) || parsedLimit < 1)
    {
        parsedLimit = defaultLimit;
    }

    // Enforce maximum limit
    if (parsedLimit > maxLimit)
    {
        parsedLimit = maxLimit;
    }

    return {
        page: parsedPage,
        limit: parsedLimit,
    };
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