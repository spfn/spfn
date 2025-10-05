/**
 * Query Module
 *
 * Parse URL query parameters for filtering, sorting, and pagination
 *
 * @example
 * // 1. Parse query parameters with middleware
 * import { QueryParser } from '@spfn/core';
 *
 * export const middlewares = [
 *   QueryParser({
 *     filters: ['email', 'role', 'status'],
 *     sort: ['createdAt', 'name'],
 *     pagination: { default: 20, max: 100 }
 *   })
 * ];
 *
 * // 2. Use in handler
 * export async function GET(c: RouteContext) {
 *   const { filters, sort, pagination } = c.get('queryParams');
 *
 *   const whereCondition = buildFilters(filters, users);
 *   const orderBy = buildSort(sort, users);
 *   const { offset, limit } = applyPagination(pagination);
 *
 *   const data = await db
 *     .select()
 *     .from(users)
 *     .where(whereCondition)
 *     .orderBy(...orderBy)
 *     .limit(limit)
 *     .offset(offset);
 *
 *   const total = await countTotal(db, users, whereCondition);
 *   const meta = createPaginationMeta(pagination, total);
 *
 *   return c.json({ data, meta });
 * }
 */

export { QueryParser } from './middleware';
export { buildFilters, orFilters } from './filters';
export { buildSort, parseSortQuery } from './sort';
export { parsePagination, createPaginationMeta, applyPagination, countTotal } from './pagination';
export * from './types';