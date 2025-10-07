/**
 * Repository Pattern (JPA Style)
 *
 * Applies Spring JPA Repository pattern to TypeScript/Drizzle
 *
 * ✅ Implemented:
 * - #11: Auto Read Replica routing (reads use Replica, writes use Primary)
 *
 * 📝 TODO: See improvements.md
 * - #4: Extend Repository methods (findMany, exists, updateMany, deleteMany, upsert, countBy)
 * - #5: Drizzle Relations support (add findWithRelations method)
 * - Improve type safety (TSelect = any → InferSelectModel)
 */

import type { SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { Filters, SortCondition, PaginationParams, PaginationMeta } from '../query';

import { buildFilters } from '../query';
import { buildSort } from '../query';
import { applyPagination, createPaginationMeta, countTotal } from '../query';
import { getRawDb } from './db-instance.js';
import { QueryError } from '../errors';

/**
 * Pageable interface (Spring Pageable style)
 */
export type Pageable = {
    filters?: Filters;
    sort?: SortCondition[];
    pagination?: PaginationParams;
};

/**
 * Page result (Spring Page style)
 */
export type Page<T> = {
    data: T[];
    meta: PaginationMeta;
};

/**
 * Repository class
 *
 * Provides JPA Repository-style CRUD methods
 *
 * ✅ Auto Read Replica routing:
 * - Read methods (findAll, findById, findOne, findPage, count) → Uses Replica
 * - Write methods (save, update, delete) → Uses Primary
 */
export class Repository<
    TTable extends PgTable,
    TSelect = TTable['$inferSelect']
>
{
    constructor(
        private db: PostgresJsDatabase<any>,
        private table: TTable,
        private useReplica: boolean = true // Whether to use Replica (default: true)
    ) {}

    /**
     * Get read-only DB
     */
    private getReadDb(): PostgresJsDatabase<any>
    {
        return this.useReplica ? getRawDb('read') : this.db;
    }

    /**
     * Get write-only DB
     */
    private getWriteDb(): PostgresJsDatabase<any>
    {
        return getRawDb('write');
    }

    /**
     * Find all records (uses Replica)
     *
     * @example
     * const users = await userRepo.findAll();
     */
    async findAll(): Promise<TSelect[]>
    {
        const readDb = this.getReadDb();
        // Type assertion needed: Drizzle's from() expects specific table signature
        return readDb.select().from(this.table as any) as Promise<TSelect[]>;
    }

    /**
     * Find with pagination (uses Replica)
     *
     * @example
     * const result = await userRepo.findPage({
     *   filters: { email: { like: 'john' } },
     *   sort: [{ field: 'createdAt', direction: 'desc' }],
     *   pagination: { page: 1, limit: 20 }
     * });
     */
    async findPage(pageable: Pageable): Promise<Page<TSelect>>
    {
        const { filters = {}, sort = [], pagination = { page: 1, limit: 20 } } = pageable;

        // Type assertions needed: Helper functions expect DrizzleTable type
        const whereCondition = buildFilters(filters, this.table as any);
        const orderBy = buildSort(sort, this.table as any);
        const { offset, limit } = applyPagination(pagination);

        // Fetch data from Replica
        const readDb = this.getReadDb();
        const data = await readDb
            .select()
            .from(this.table as any)
            .where(whereCondition)
            .orderBy(...orderBy)
            .limit(limit)
            .offset(offset) as TSelect[];

        // Count total (uses Replica)
        const total = await countTotal(readDb, this.table as any, whereCondition);
        const meta = createPaginationMeta(pagination, total);

        return { data, meta };
    }

    /**
     * Find one record by ID (uses Replica)
     *
     * @example
     * const user = await userRepo.findById(1);
     */
    async findById(id: number | string): Promise<TSelect | null>
    {
        const idColumn = (this.table as Record<string, any>).id;

        if (!idColumn)
        {
            throw new QueryError('Table does not have an id column');
        }

        const { eq } = await import('drizzle-orm');
        const readDb = this.getReadDb();
        const [result] = await readDb
            .select()
            .from(this.table as any)
            .where(eq(idColumn, id)) as TSelect[];

        return result ?? null;
    }

    /**
     * Find one record by condition (uses Replica)
     *
     * @example
     * const user = await userRepo.findOne(eq(users.email, 'john@example.com'));
     */
    async findOne(where: SQL<unknown>): Promise<TSelect | null>
    {
        const readDb = this.getReadDb();
        const [result] = await readDb
            .select()
            .from(this.table as any)
            .where(where) as TSelect[];

        return result ?? null;
    }

    /**
     * Create a new record (uses Primary)
     *
     * @example
     * const user = await userRepo.save({ email: 'john@example.com', name: 'John' });
     */
    async save(data: any): Promise<TSelect>
    {
        const writeDb = this.getWriteDb();
        const [result] = await writeDb
            .insert(this.table)
            .values(data)
            .returning() as TSelect[];

        return result;
    }

    /**
     * Update a record (uses Primary)
     *
     * @example
     * const user = await userRepo.update(1, { name: 'Jane' });
     */
    async update(id: number | string, data: any): Promise<TSelect | null>
    {
        const idColumn = (this.table as Record<string, any>).id;

        if (!idColumn)
        {
            throw new QueryError('Table does not have an id column');
        }

        const { eq } = await import('drizzle-orm');
        const writeDb = this.getWriteDb();
        const [result] = await writeDb
            .update(this.table)
            .set(data)
            .where(eq(idColumn, id))
            .returning() as TSelect[];

        return result ?? null;
    }

    /**
     * Delete a record (uses Primary)
     *
     * @example
     * const deleted = await userRepo.delete(1);
     */
    async delete(id: number | string): Promise<TSelect | null>
    {
        const idColumn = (this.table as Record<string, any>).id;

        if (!idColumn)
        {
            throw new QueryError('Table does not have an id column');
        }

        const { eq } = await import('drizzle-orm');
        const writeDb = this.getWriteDb();
        const [result] = await writeDb
            .delete(this.table)
            .where(eq(idColumn, id))
            .returning() as TSelect[];

        return result ?? null;
    }

    /**
     * Count records (uses Replica)
     *
     * @example
     * const count = await userRepo.count();
     */
    async count(where?: SQL<unknown>): Promise<number>
    {
        const readDb = this.getReadDb();
        return countTotal(readDb, this.table as any, where);
    }
}