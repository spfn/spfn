/**
 * Filter Builder
 *
 * Drizzle ORM where 조건을 동적으로 생성하는 유틸리티
 *
 * 📝 TODO: improvements.md 참고
 * - #8: OR 조건 지원 ($or 문법으로 복잡한 조건 표현)
 * - 중첩 필터 지원 (AND/OR 혼합 조건)
 * - 필터 값 검증 (타입 체크 및 범위 검증)
 */

import { and, eq, ne, gt, gte, lt, lte, like, inArray, notInArray, isNull, isNotNull, or, SQL } from 'drizzle-orm';

import type { PgColumn } from 'drizzle-orm/pg-core';

import type { FilterOperator, Filters, FilterValue, DrizzleTable, FilterResult } from './types';

/**
 * 필터 조건을 Drizzle SQL 조건으로 변환
 *
 * @param filters - 파싱된 필터 객체
 * @param table - Drizzle 테이블 스키마
 * @returns SQL where 조건 (없으면 undefined)
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

        // 각 연산자별 조건 생성
        for (const [operator, value] of Object.entries(filterCondition))
        {
            const condition = buildCondition(column, operator as FilterOperator, value);
            if (condition)
            {
                conditions.push(condition);
            }
        }
    }

    // 모든 조건을 AND로 결합
    return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * 단일 필터 조건을 SQL 조건으로 변환
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
 * OR 조건으로 결합
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