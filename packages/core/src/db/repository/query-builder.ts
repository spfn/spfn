/**
 * Query Builder (Fluent Interface)
 *
 * Chainable query builder for Repository pattern.
 * Provides a fluent API for building complex queries.
 *
 * @example
 * ```typescript
 * const users = await userRepo
 *     .query()
 *     .where({ status: 'active' })
 *     .where({ role: 'admin' })
 *     .orderBy('createdAt', 'desc')
 *     .limit(10)
 *     .findMany();
 * ```
 */

import type { PgTable } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { Filters, SortCondition } from './filters.js';

import { buildFilters, buildSort } from './filters.js';

/**
 * Query Builder class for chainable queries
 *
 * Supports method chaining for building complex queries in a fluent style.
 */
export class QueryBuilder<
    TTable extends PgTable,
    TSelect = TTable['$inferSelect']
>
{
    private db: PostgresJsDatabase<any>;
    private table: TTable;
    private filterConditions: Filters[] = [];
    private sortConditions: SortCondition[] = [];
    private limitValue?: number;
    private offsetValue?: number;

    constructor(db: PostgresJsDatabase<any>, table: TTable)
    {
        this.db = db;
        this.table = table;
    }

    /**
     * Add WHERE conditions
     *
     * Multiple where() calls are combined with AND logic.
     *
     * @param filters - Filter conditions
     * @returns QueryBuilder for chaining
     *
     * @example
     * ```typescript
     * query
     *     .where({ status: 'active' })
     *     .where({ role: 'admin' })  // AND condition
     * ```
     */
    where(filters: Filters): this
    {
        this.filterConditions.push(filters);
        return this;
    }

    /**
     * Add ORDER BY clause
     *
     * Multiple orderBy() calls create multi-column sorting.
     *
     * @param field - Field name to sort by
     * @param direction - Sort direction ('asc' or 'desc')
     * @returns QueryBuilder for chaining
     *
     * @example
     * ```typescript
     * query
     *     .orderBy('isPremium', 'desc')
     *     .orderBy('createdAt', 'desc')
     * ```
     */
    orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): this
    {
        this.sortConditions.push({ field, direction });
        return this;
    }

    /**
     * Set LIMIT clause
     *
     * @param limit - Maximum number of records to return
     * @returns QueryBuilder for chaining
     *
     * @example
     * ```typescript
     * query.limit(10)
     * ```
     */
    limit(limit: number): this
    {
        this.limitValue = limit;
        return this;
    }

    /**
     * Set OFFSET clause
     *
     * @param offset - Number of records to skip
     * @returns QueryBuilder for chaining
     *
     * @example
     * ```typescript
     * query.offset(20)
     * ```
     */
    offset(offset: number): this
    {
        this.offsetValue = offset;
        return this;
    }

    /**
     * Execute query and return multiple records
     *
     * @returns Array of records
     *
     * @example
     * ```typescript
     * const users = await query
     *     .where({ status: 'active' })
     *     .orderBy('createdAt', 'desc')
     *     .limit(10)
     *     .findMany();
     * ```
     */
    async findMany(): Promise<TSelect[]>
    {
        // Merge all filter conditions with AND
        const mergedFilters = this.mergeFilters();
        const whereCondition = buildFilters(mergedFilters, this.table as any);
        const orderBy = buildSort(this.sortConditions, this.table as any);

        let query = this.db
            .select()
            .from(this.table as any)
            .where(whereCondition)
            .orderBy(...orderBy);

        if (this.limitValue !== undefined)
        {
            query = query.limit(this.limitValue) as any;
        }

        if (this.offsetValue !== undefined)
        {
            query = query.offset(this.offsetValue) as any;
        }

        return query as Promise<TSelect[]>;
    }

    /**
     * Execute query and return first record
     *
     * @returns First matching record or null
     *
     * @example
     * ```typescript
     * const user = await query
     *     .where({ email: 'john@example.com' })
     *     .findOne();
     * ```
     */
    async findOne(): Promise<TSelect | null>
    {
        const results = await this.limit(1).findMany();
        return results[0] ?? null;
    }

    /**
     * Execute query and return count
     *
     * @returns Number of matching records
     *
     * @example
     * ```typescript
     * const count = await query
     *     .where({ status: 'active' })
     *     .count();
     * ```
     */
    async count(): Promise<number>
    {
        const mergedFilters = this.mergeFilters();
        const whereCondition = buildFilters(mergedFilters, this.table as any);

        const { count } = await import('drizzle-orm');
        const result = await this.db
            .select({ count: count() })
            .from(this.table as any)
            .where(whereCondition);

        return Number(result[0]?.count ?? 0);
    }

    /**
     * Merge multiple filter conditions into single object
     *
     * Combines all where() calls into one filter object.
     */
    private mergeFilters(): Filters
    {
        if (this.filterConditions.length === 0)
        {
            return {};
        }

        // Merge all filter objects
        return this.filterConditions.reduce((merged, current) => {
            return { ...merged, ...current };
        }, {});
    }
}