/**
 * Query Module
 *
 * URL 쿼리 파라미터를 파싱하여 필터/정렬/페이지네이션을 처리하는 모듈
 *
 * @example
 * // 1. 미들웨어로 쿼리 파라미터 파싱
 * import { QueryParser } from '@/server/core/query';
 *
 * export const middlewares = [
 *   QueryParser({
 *     filters: ['email', 'role', 'status'],
 *     sort: ['createdAt', 'name'],
 *     pagination: { default: 20, max: 100 }
 *   })
 * ];
 *
 * // 2. 핸들러에서 사용
 * export async function GET(c: RouteContext) {
 *   const { filters, sort, pagination } = c.raw.get('queryParams');
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