/**
 * Repository Pattern (JPA Style)
 *
 * Spring JPA-inspired Repository pattern for TypeScript/Drizzle ORM
 *
 * ✅ Features:
 * - Auto Read/Write Replica routing (read methods use Replica, write methods use Primary)
 * - Type-safe CRUD operations (findById, findWhere, save, update, delete, etc.)
 * - Advanced filtering with operators (eq, gt, like, in, etc.)
 * - Pagination with metadata (findPage)
 * - Batch operations (saveMany, updateWhere, deleteWhere)
 * - JPA-style relation loading (findByIdWith, findManyWith)
 * - Transaction-aware (automatic participation in Transactional middleware)
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
import { getTableName } from './relation-registry.js';
import { QueryBuilder } from './query-builder.js';

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
 * Relation loading options (JPA-style)
 *
 * Supports nested relations similar to Spring JPA's EntityGraph
 *
 * @example
 * ```typescript
 * // Load single relation
 * { with: { posts: true } }
 *
 * // Load nested relations
 * { with: { posts: { with: { comments: true } } } }
 *
 * // Load multiple relations
 * { with: { posts: true, profile: true } }
 * ```
 */
export type WithRelations = {
    with?: Record<string, boolean | { with?: Record<string, any> }>;
};

/**
 * Options for findById with relations
 */
export type FindByIdOptions = WithRelations;

/**
 * Options for findWhere with relations
 */
export type FindWhereOptions = WithRelations;

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
    protected db: PostgresJsDatabase<any>;
    protected table: TTable;
    protected useReplica: boolean;
    protected explicitDb?: PostgresJsDatabase<any>; // Track if db was explicitly provided

    constructor(
        dbOrTable: PostgresJsDatabase<any> | TTable,
        tableOrUseReplica?: TTable | boolean,
        useReplica: boolean = true
    ) {
        // Overload 1: new Repository(table) - db auto-resolved
        if ('name' in dbOrTable && typeof dbOrTable.name === 'string') {
            this.db = getRawDb('write');
            this.table = dbOrTable as TTable;
            this.useReplica = typeof tableOrUseReplica === 'boolean' ? tableOrUseReplica : true;
            this.explicitDb = undefined; // No explicit db provided
        }
        // Overload 2: new Repository(db, table, useReplica?) - explicit db provided
        else {
            this.db = dbOrTable as PostgresJsDatabase<any>;
            this.table = tableOrUseReplica as TTable;
            this.useReplica = useReplica;
            this.explicitDb = this.db; // Save explicit db
        }
    }

    /**
     * Get read-only DB
     */
    private getReadDb(): PostgresJsDatabase<any>
    {
        // If db was explicitly provided, always use it
        if (this.explicitDb) {
            return this.explicitDb;
        }
        // Otherwise use getRawDb for replica routing
        return this.useReplica ? getRawDb('read') : this.db;
    }

    /**
     * Get write-only DB
     */
    private getWriteDb(): PostgresJsDatabase<any>
    {
        // If db was explicitly provided, always use it
        if (this.explicitDb) {
            return this.explicitDb;
        }
        // Otherwise use getRawDb for write operations
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

    /**
     * Find records by filters (uses Replica)
     *
     * @example
     * const users = await userRepo.findWhere({ email: { like: '@gmail.com' }, status: 'active' });
     */
    async findWhere(filters: Filters): Promise<TSelect[]>
    {
        const whereCondition = buildFilters(filters, this.table as any);
        const readDb = this.getReadDb();
        return readDb
            .select()
            .from(this.table as any)
            .where(whereCondition) as Promise<TSelect[]>;
    }

    /**
     * Find one record by filters (uses Replica)
     *
     * @example
     * const user = await userRepo.findOneWhere({ email: 'john@example.com' });
     */
    async findOneWhere(filters: Filters): Promise<TSelect | null>
    {
        const whereCondition = buildFilters(filters, this.table as any);
        const readDb = this.getReadDb();
        const [result] = await readDb
            .select()
            .from(this.table as any)
            .where(whereCondition) as TSelect[];

        return result ?? null;
    }

    /**
     * Check if record exists by ID (uses Replica)
     *
     * @example
     * const exists = await userRepo.exists(1);
     */
    async exists(id: number | string): Promise<boolean>
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
            .where(eq(idColumn, id))
            .limit(1) as TSelect[];

        return !!result;
    }

    /**
     * Check if record exists by filters (uses Replica)
     *
     * @example
     * const exists = await userRepo.existsBy({ email: 'john@example.com' });
     */
    async existsBy(filters: Filters): Promise<boolean>
    {
        const whereCondition = buildFilters(filters, this.table as any);
        const readDb = this.getReadDb();
        const [result] = await readDb
            .select()
            .from(this.table as any)
            .where(whereCondition)
            .limit(1) as TSelect[];

        return !!result;
    }

    /**
     * Count records by filters (uses Replica)
     *
     * @example
     * const count = await userRepo.countBy({ status: 'active' });
     */
    async countBy(filters: Filters): Promise<number>
    {
        const whereCondition = buildFilters(filters, this.table as any);
        const readDb = this.getReadDb();
        return countTotal(readDb, this.table as any, whereCondition);
    }

    /**
     * Create multiple records (uses Primary)
     *
     * @example
     * const users = await userRepo.saveMany([
     *   { email: 'user1@example.com', name: 'User 1' },
     *   { email: 'user2@example.com', name: 'User 2' }
     * ]);
     */
    async saveMany(data: any[]): Promise<TSelect[]>
    {
        const writeDb = this.getWriteDb();
        return writeDb
            .insert(this.table)
            .values(data)
            .returning() as Promise<TSelect[]>;
    }

    /**
     * Update multiple records by filters (uses Primary)
     *
     * @example
     * const count = await userRepo.updateWhere({ status: 'inactive' }, { status: 'archived' });
     */
    async updateWhere(filters: Filters, data: any): Promise<number>
    {
        const whereCondition = buildFilters(filters, this.table as any);
        const writeDb = this.getWriteDb();
        const results = await writeDb
            .update(this.table)
            .set(data)
            .where(whereCondition)
            .returning() as TSelect[];

        return results.length;
    }

    /**
     * Delete multiple records by filters (uses Primary)
     *
     * @example
     * const count = await userRepo.deleteWhere({ status: 'banned' });
     */
    async deleteWhere(filters: Filters): Promise<number>
    {
        const whereCondition = buildFilters(filters, this.table as any);
        const writeDb = this.getWriteDb();
        const results = await writeDb
            .delete(this.table)
            .where(whereCondition)
            .returning() as TSelect[];

        return results.length;
    }

    // ============================================================
    // Query Builder (Fluent Interface)
    // ============================================================

    /**
     * Start a chainable query builder (uses Replica)
     *
     * Returns a QueryBuilder instance for building complex queries with method chaining.
     *
     * @returns QueryBuilder instance for chaining
     *
     * @example
     * ```typescript
     * // Simple chaining
     * const users = await userRepo
     *     .query()
     *     .where({ status: 'active' })
     *     .orderBy('createdAt', 'desc')
     *     .limit(10)
     *     .findMany();
     *
     * // Multiple conditions
     * const admins = await userRepo
     *     .query()
     *     .where({ role: 'admin' })
     *     .where({ status: 'active' })  // AND condition
     *     .findMany();
     *
     * // Reusable query
     * const activeQuery = userRepo.query().where({ status: 'active' });
     * const users = await activeQuery.findMany();
     * const count = await activeQuery.count();
     * ```
     */
    query(): QueryBuilder<TTable, TSelect>
    {
        const readDb = this.getReadDb();
        return new QueryBuilder<TTable, TSelect>(readDb, this.table);
    }

    // ============================================================
    // JPA-Style Relation Loading
    // ============================================================

    /**
     * Check if db.query API is available
     *
     * Drizzle's relational query API requires schema to be passed during db initialization.
     *
     * @returns true if db.query is available
     */
    private hasQueryApi(): boolean
    {
        const readDb = this.getReadDb();
        return !!readDb.query && typeof readDb.query === 'object';
    }

    /**
     * Get table query interface from db.query
     *
     * @returns Table query interface or undefined
     */
    private getTableQuery(): any
    {
        if (!this.hasQueryApi()) {
            return undefined;
        }

        const readDb = this.getReadDb();
        const tableName = getTableName(this.table);

        // Try to get table query from db.query
        // Type assertion needed: Drizzle's query API uses dynamic table names
        return (readDb.query as any)?.[tableName];
    }

    /**
     * Find record by ID with relations (uses Replica)
     *
     * JPA-style relation loading using Drizzle's relational query API.
     *
     * @param id - Primary key value
     * @param options - Relation loading options
     * @returns Record with loaded relations, or null if not found
     *
     * @throws {QueryError} If db.query API is not available
     *
     * @example
     * ```typescript
     * // Load user with posts
     * const user = await userRepo.findByIdWith(1, {
     *     with: { posts: true }
     * });
     *
     * // Load nested relations
     * const user = await userRepo.findByIdWith(1, {
     *     with: {
     *         posts: {
     *             with: { comments: true }
     *         }
     *     }
     * });
     * ```
     */
    async findByIdWith(id: number | string, options: FindByIdOptions): Promise<any>
    {
        const tableQuery = this.getTableQuery();

        if (!tableQuery || !tableQuery.findFirst) {
            throw new QueryError(
                'Relational queries require db.query API. ' +
                'Initialize your database with schema: ' +
                'drizzle(client, { schema: { users, posts, ... } })'
            );
        }

        // Use Drizzle's relational query API
        const { eq } = await import('drizzle-orm');
        const idColumn = (this.table as Record<string, any>).id;

        if (!idColumn) {
            throw new QueryError('Table does not have an id column');
        }

        const result = await tableQuery.findFirst({
            where: eq(idColumn, id),
            ...(options.with && { with: options.with })
        });

        // Return null for consistency (findFirst returns undefined when not found)
        return result ?? null;
    }

    /**
     * Find multiple records with relations (uses Replica)
     *
     * JPA-style relation loading for multiple records.
     *
     * @param options - Query options with relation loading
     * @returns Array of records with loaded relations
     *
     * @throws {QueryError} If db.query API is not available
     *
     * @example
     * ```typescript
     * // Load all users with their posts
     * const users = await userRepo.findManyWith({
     *     with: { posts: true }
     * });
     *
     * // Load with filters
     * const activeUsers = await userRepo.findManyWith({
     *     where: eq(users.status, 'active'),
     *     with: { posts: true, profile: true }
     * });
     * ```
     */
    async findManyWith(options: { where?: SQL<unknown> } & WithRelations): Promise<any[]>
    {
        const tableQuery = this.getTableQuery();

        if (!tableQuery || !tableQuery.findMany) {
            throw new QueryError(
                'Relational queries require db.query API. ' +
                'Initialize your database with schema: ' +
                'drizzle(client, { schema: { users, posts, ... } })'
            );
        }

        // Use Drizzle's relational query API
        return await tableQuery.findMany({
            ...(options.where && { where: options.where }),
            ...(options.with && { with: options.with })
        });
    }

    /**
     * Find one record with relations (uses Replica)
     *
     * JPA-style relation loading for a single record.
     *
     * @param options - Query options with relation loading
     * @returns Record with loaded relations, or undefined if not found
     *
     * @throws {QueryError} If db.query API is not available
     *
     * @example
     * ```typescript
     * // Find user by email with posts
     * const user = await userRepo.findOneWith({
     *     where: eq(users.email, 'john@example.com'),
     *     with: { posts: true }
     * });
     * ```
     */
    async findOneWith(options: { where: SQL<unknown> } & WithRelations): Promise<any>
    {
        const tableQuery = this.getTableQuery();

        if (!tableQuery || !tableQuery.findFirst) {
            throw new QueryError(
                'Relational queries require db.query API. ' +
                'Initialize your database with schema: ' +
                'drizzle(client, { schema: { users, posts, ... } })'
            );
        }

        // Use Drizzle's relational query API
        return await tableQuery.findFirst({
            where: options.where,
            ...(options.with && { with: options.with })
        });
    }
}