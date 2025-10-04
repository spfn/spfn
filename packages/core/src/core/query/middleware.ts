/**
 * QueryParser Middleware
 *
 * URL 쿼리 파라미터를 파싱하여 필터/정렬/페이지네이션 정보를 Context에 저장
 */

import { createMiddleware } from 'hono/factory';

import type { QueryParserOptions, QueryParams, Filters, FilterCondition, FilterValue } from './types';

import { parseSortQuery } from './sort';
import { parsePagination } from './pagination';

/**
 * QueryParser 미들웨어
 *
 * @param options - 허용할 필터/정렬 필드 및 페이지네이션 설정
 * @returns Hono 미들웨어
 *
 * @example
 * export const middlewares = [
 *   QueryParser({
 *     filters: ['email', 'role', 'status'],
 *     sort: ['createdAt', 'name'],
 *     pagination: { default: 20, max: 100 }
 *   })
 * ];
 *
 * export async function GET(c: RouteContext) {
 *   const { filters, sort, pagination } = c.get('queryParams');
 *   // ...
 * }
 */
export function QueryParser(options: QueryParserOptions = {})
{
    const {
        filters: allowedFilters = [],
        sort: allowedSort = [],
        pagination: paginationOptions = {},
    } = options;

    return createMiddleware(async (c, next) =>
    {
        // 1. 필터 파싱
        const filters = parseFilters(c.req.query(), allowedFilters);

        // 2. 정렬 파싱
        const sortQuery = c.req.query('sort');
        const sort = parseSortQuery(sortQuery, allowedSort);

        // 3. 페이지네이션 파싱
        const pagination = parsePagination(
            c.req.query('page'),
            c.req.query('limit'),
            paginationOptions
        );

        // 4. Context에 저장
        const queryParams: QueryParams = {
            filters,
            sort,
            pagination,
        };

        c.set('queryParams', queryParams);

        await next();
    });
}

/**
 * 쿼리 파라미터에서 필터 파싱
 *
 * URL 형태: ?email[eq]=john@example.com&age[gte]=18&role[in]=admin,user
 *
 * @param query - Hono req.query() 결과
 * @param allowedFields - 허용된 필드 목록
 * @returns 파싱된 필터 객체
 */
function parseFilters(
    query: Record<string, string | string[]>,
    allowedFields: string[]
): Filters
{
    const filters: Filters = {};

    for (const [key, value] of Object.entries(query))
    {
        // 필터 패턴: field[operator] (예: email[eq], age[gte])
        const match = key.match(/^(\w+)\[(\w+)\]$/);

        if (!match) continue;

        const [, field, operator] = match;

        // 허용된 필드인지 확인
        if (allowedFields.length > 0 && !allowedFields.includes(field))
        {
            console.warn(`[QueryParser] Field '${field}' is not allowed`);
            continue;
        }

        // 필터 값 파싱
        const filterValue = parseFilterValue(operator, value);

        if (!filters[field])
        {
            filters[field] = {};
        }

        filters[field][operator as keyof FilterCondition] = filterValue;
    }

    return filters;
}

/**
 * 필터 값 파싱 (타입 변환)
 */
function parseFilterValue(operator: string, value: string | string[]): FilterValue
{
    // 배열 연산자 (in, nin)
    if (operator === 'in' || operator === 'nin')
    {
        if (Array.isArray(value)) return value;
        return value.split(',').map(v => v.trim());
    }

    // null 체크 (is)
    if (operator === 'is')
    {
        return value as string; // 'null' 또는 'notnull'
    }

    // 단일 값
    const singleValue = Array.isArray(value) ? value[0] : value;

    // 숫자 변환 시도
    const num = Number(singleValue);
    if (!isNaN(num))
    {
        return num;
    }

    // boolean 변환
    if (singleValue === 'true') return true;
    if (singleValue === 'false') return false;

    // 문자열 그대로 반환
    return singleValue;
}