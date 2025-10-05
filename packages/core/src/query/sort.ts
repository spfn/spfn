/**
 * Sort Builder
 *
 * Drizzle ORM orderBy 조건을 동적으로 생성하는 유틸리티
 */

import { asc, desc, SQL } from 'drizzle-orm';

import type { PgColumn } from 'drizzle-orm/pg-core';

import type { SortCondition, DrizzleTable, SortResult } from './types';

/**
 * 정렬 조건을 Drizzle SQL orderBy 조건으로 변환
 *
 * @param sortConditions - 정렬 조건 배열
 * @param table - Drizzle 테이블 스키마
 * @returns SQL orderBy 조건 배열
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
 * 쿼리 문자열에서 정렬 조건 파싱
 *
 * @param sortQuery - 정렬 쿼리 문자열 ('createdAt:desc,name:asc')
 * @param allowedFields - 허용된 필드 목록
 * @returns 정렬 조건 배열
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

        // 허용된 필드인지 확인
        if (allowedFields.length > 0 && !allowedFields.includes(field))
        {
            console.warn(`[parseSortQuery] Field '${field}' is not allowed`);
            continue;
        }

        // 유효한 방향인지 확인
        if (direction !== 'asc' && direction !== 'desc')
        {
            console.warn(`[parseSortQuery] Invalid direction '${direction}' for field '${field}'`);
            continue;
        }

        conditions.push({ field, direction });
    }

    return conditions;
}