/**
 * QueryParser Middleware
 *
 * Parse URL query parameters and store filter/sort/pagination info in Context
 */

import { createMiddleware } from 'hono/factory';

import type { QueryParserOptions, QueryParams, Filters, FilterCondition, FilterValue } from './types';

import { parseSortQuery } from './sort';
import { parsePagination } from './pagination';

/**
 * QueryParser middleware
 *
 * @param options - Allowed filter/sort fields and pagination configuration
 * @returns Hono middleware
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
        // 1. Parse filters
        const filters = parseFilters(c.req.query(), allowedFilters);

        // 2. Parse sort
        const sortQuery = c.req.query('sort');
        const sort = parseSortQuery(sortQuery, allowedSort);

        // 3. Parse pagination
        const pagination = parsePagination(
            c.req.query('page'),
            c.req.query('limit'),
            paginationOptions
        );

        // 4. Store in context
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
 * Parse filters from query parameters
 *
 * URL format: ?email[eq]=john@example.com&age[gte]=18&role[in]=admin,user
 *
 * @param query - Hono req.query() result
 * @param allowedFields - Allowed field list
 * @returns Parsed filter object
 */
function parseFilters(
    query: Record<string, string | string[]>,
    allowedFields: string[]
): Filters
{
    const filters: Filters = {};

    for (const [key, value] of Object.entries(query))
    {
        // Filter pattern: field[operator] (e.g., email[eq], age[gte])
        const match = key.match(/^(\w+)\[(\w+)\]$/);

        if (!match) continue;

        const [, field, operator] = match;

        // Check if field is allowed
        if (allowedFields.length > 0 && !allowedFields.includes(field))
        {
            console.warn(`[QueryParser] Field '${field}' is not allowed`);
            continue;
        }

        // Parse filter value
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
 * Parse filter value (type conversion)
 */
function parseFilterValue(operator: string, value: string | string[]): FilterValue
{
    // Array operators (in, nin)
    if (operator === 'in' || operator === 'nin')
    {
        if (Array.isArray(value)) return value;
        return value.split(',').map(v => v.trim());
    }

    // Null check (is)
    if (operator === 'is')
    {
        return value as string; // 'null' or 'notnull'
    }

    // Single value
    const singleValue = Array.isArray(value) ? value[0] : value;

    // Try number conversion
    const num = Number(singleValue);
    if (!isNaN(num))
    {
        return num;
    }

    // Boolean conversion
    if (singleValue === 'true') return true;
    if (singleValue === 'false') return false;

    // Return string as-is
    return singleValue;
}