/**
 * Pagination Helper
 *
 * 페이지네이션 관련 유틸리티
 */

import { sql } from 'drizzle-orm';

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { PaginationParams, PaginationMeta, DrizzleTable } from './types';

/**
 * 쿼리 파라미터에서 페이지네이션 파싱
 *
 * @param page - 페이지 번호 (쿼리에서 가져옴)
 * @param limit - 페이지 크기 (쿼리에서 가져옴)
 * @param options - 기본값/최대값 설정
 * @returns 페이지네이션 파라미터
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

    // 유효성 검증
    if (isNaN(parsedPage) || parsedPage < 1)
    {
        parsedPage = 1;
    }

    if (isNaN(parsedLimit) || parsedLimit < 1)
    {
        parsedLimit = defaultLimit;
    }

    // 최대값 제한
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
 * 페이지네이션 메타 정보 생성
 *
 * @param pagination - 페이지네이션 파라미터
 * @param total - 전체 데이터 개수
 * @returns 페이지네이션 메타 정보
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
 * Drizzle 쿼리에 페이지네이션 적용
 *
 * @param pagination - 페이지네이션 파라미터
 * @returns { offset, limit } 객체
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
 * 전체 개수 조회 (카운트 쿼리)
 *
 * @param db - Drizzle DB 인스턴스
 * @param table - 테이블 스키마
 * @param whereCondition - where 조건 (선택)
 * @returns 전체 개수
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