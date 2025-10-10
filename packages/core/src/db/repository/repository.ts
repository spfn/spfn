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
 * - Transaction-aware (automatic participation in Transactional middleware)
 */

import type { SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { Filters, SortCondition, PaginationParams, PaginationMeta } from '../../query';

import { buildFilters } from '../../query';
import { buildSort } from '../../query';
import { applyPagination, createPaginationMeta, countTotal } from '../../query';
import { getRawDb, getDatabaseMonitoringConfig } from '../manager';
import { getTransaction } from '../transaction';
import { QueryError } from '../../errors';
import { QueryBuilder } from './query-builder.js';
import { logger } from '../../logger';

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
 * Provides JPA Repository-style CRUD methods with automatic transaction support
 *
 * ✅ Automatic Transaction Detection:
 * - Automatically participates in active Transactional() middleware context
 * - No need to pass transaction explicitly - uses AsyncLocalStorage
 * - All operations within a transaction use the same transaction DB
 *
 * ✅ Auto Read/Write Replica routing (when NOT in transaction):
 * - Read methods (findAll, findById, findOne, findPage, count) → Uses Read Replica
 * - Write methods (save, update, delete) → Uses Primary DB
 *
 * ✅ DB Priority:
 * 1. Explicit DB (if provided in constructor)
 * 2. Transaction context (if inside Transactional middleware)
 * 3. Read Replica or Primary DB (based on operation type)
 *
 * @example
 * ```typescript
 * // Simple usage - automatically detects transaction
 * class UserService {
 *   private get repo() {
 *     return new Repository(users);  // Auto-detects transaction
 *   }
 * }
 *
 * // Route with transaction
 * app.bind(contract, Transactional(), async (c) => {
 *   const service = new UserService();
 *   await service.createUser(data);
 *   // Automatic rollback on error!
 * });
 * ```
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
    protected autoUpdateField?: string; // Field name to auto-update (e.g., 'updatedAt', 'modifiedAt')

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

        // Detect auto-update timestamp field from schema
        this.autoUpdateField = this.detectAutoUpdateField();
    }

    /**
     * Detect which field (if any) should be auto-updated
     *
     * Checks all table columns for __autoUpdate metadata flag.
     * Set by autoUpdateTimestamp() or timestamps({ autoUpdate: true }) helpers.
     *
     * @returns Field name to auto-update, or undefined if none found
     */
    private detectAutoUpdateField(): string | undefined
    {
        const tableColumns = this.table as Record<string, any>;

        for (const [fieldName, column] of Object.entries(tableColumns))
        {
            // Skip non-column properties (like '_', '$inferSelect', etc.)
            if (fieldName.startsWith('_') || fieldName.startsWith('$'))
            {
                continue;
            }

            // Check if column has __autoUpdate flag
            if (column && typeof column === 'object' && column.__autoUpdate === true)
            {
                return fieldName;
            }
        }

        return undefined;
    }

    /**
     * Inject auto-update timestamp if configured
     *
     * Only injects if:
     * 1. Table has an auto-update field configured (via autoUpdateTimestamp() or timestamps({ autoUpdate: true }))
     * 2. The field is not already explicitly provided in the data
     *
     * @param data - Update data object
     * @returns Data with auto-update timestamp injected (if applicable)
     */
    private injectAutoUpdateTimestamp(data: any): any
    {
        // No auto-update field configured
        if (!this.autoUpdateField)
        {
            return data;
        }

        // Field already explicitly provided, don't override
        if (data && this.autoUpdateField in data)
        {
            return data;
        }

        // Inject current timestamp
        return {
            ...data,
            [this.autoUpdateField]: new Date(),
        };
    }

    /**
     * Get id column from table
     *
     * Helper method to reduce code duplication across methods that need id column.
     *
     * @returns The id column object
     * @throws {QueryError} If table does not have an id column
     */
    private getIdColumn()
    {
        const idColumn = (this.table as Record<string, any>).id;

        if (!idColumn)
        {
            throw new QueryError('Table does not have an id column');
        }

        return idColumn;
    }

    /**
     * Get read-only DB
     *
     * Automatically detects and uses transaction context if available.
     * When in transaction, uses transaction DB to ensure read consistency.
     * Priority: explicitDb > transaction > replica/primary DB
     */
    private getReadDb(): PostgresJsDatabase<any>
    {
        // If db was explicitly provided, always use it
        if (this.explicitDb) {
            return this.explicitDb;
        }

        // Check if we're inside a transaction context
        // Use transaction for reads too to ensure consistency
        const tx = getTransaction();
        if (tx) {
            return tx;
        }

        // Otherwise use getRawDb for replica routing
        return this.useReplica ? getRawDb('read') : this.db;
    }

    /**
     * Get write-only DB
     *
     * Automatically detects and uses transaction context if available.
     * Priority: explicitDb > transaction > primary DB
     */
    private getWriteDb(): PostgresJsDatabase<any>
    {
        // If db was explicitly provided, always use it
        if (this.explicitDb) {
            return this.explicitDb;
        }

        // Check if we're inside a transaction context
        const tx = getTransaction();
        if (tx) {
            return tx;
        }

        // Otherwise use getRawDb for write operations
        return getRawDb('write');
    }

    /**
     * Execute operation with performance monitoring
     *
     * Wraps database operations with timing and logging for slow queries.
     * Only logs if monitoring is enabled and query exceeds threshold.
     *
     * @param operation - Name of the operation (for logging)
     * @param fn - Async function to execute
     * @returns Result of the operation
     */
    private async executeWithMonitoring<T>(
        operation: string,
        fn: () => Promise<T>
    ): Promise<T>
    {
        const config = getDatabaseMonitoringConfig();

        // If monitoring is disabled, just execute the operation
        if (!config?.enabled)
        {
            return fn();
        }

        const startTime = performance.now();

        try
        {
            const result = await fn();
            const duration = performance.now() - startTime;

            // Log slow queries
            if (duration >= config.slowThreshold)
            {
                const dbLogger = logger.child('database');
                const logData: any = {
                    operation,
                    table: this.table._.name,
                    duration: `${duration.toFixed(2)}ms`,
                    threshold: `${config.slowThreshold}ms`,
                };

                dbLogger.warn('Slow query detected', logData);
            }

            return result;
        }
        catch (error)
        {
            const duration = performance.now() - startTime;
            const dbLogger = logger.child('database');
            const message = error instanceof Error ? error.message : 'Unknown error';

            dbLogger.error('Query failed', {
                operation,
                table: this.table._.name,
                duration: `${duration.toFixed(2)}ms`,
                error: message,
            });

            throw error;
        }
    }

    /**
     * Find all records (uses Replica)
     *
     * @example
     * const users = await userRepo.findAll();
     */
    async findAll(): Promise<TSelect[]>
    {
        return this.executeWithMonitoring('findAll', async () =>
        {
            const readDb = this.getReadDb();
            // Type assertion needed: Drizzle's from() expects specific table signature
            return readDb.select().from(this.table as any) as Promise<TSelect[]>;
        });
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
        return this.executeWithMonitoring('findPage', async () =>
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
        });
    }

    /**
     * Find one record by ID (uses Replica)
     *
     * @example
     * const user = await userRepo.findById(1);
     */
    async findById(id: number | string): Promise<TSelect | null>
    {
        return this.executeWithMonitoring('findById', async () =>
        {
            const idColumn = this.getIdColumn();

            const { eq } = await import('drizzle-orm');
            const readDb = this.getReadDb();
            const [result] = await readDb
                .select()
                .from(this.table as any)
                .where(eq(idColumn, id)) as TSelect[];

            return result ?? null;
        });
    }

    /**
     * Find one record by condition (uses Replica)
     *
     * @example
     * const user = await userRepo.findOne(eq(users.email, 'john@example.com'));
     */
    async findOne(where: SQL<unknown>): Promise<TSelect | null>
    {
        return this.executeWithMonitoring('findOne', async () =>
        {
            const readDb = this.getReadDb();
            const [result] = await readDb
                .select()
                .from(this.table as any)
                .where(where) as TSelect[];

            return result ?? null;
        });
    }

    /**
     * Create a new record (uses Primary)
     *
     * @example
     * const user = await userRepo.save({ email: 'john@example.com', name: 'John' });
     */
    async save(data: any): Promise<TSelect>
    {
        return this.executeWithMonitoring('save', async () =>
        {
            const writeDb = this.getWriteDb();
            const [result] = await writeDb
                .insert(this.table)
                .values(data)
                .returning() as TSelect[];

            return result;
        });
    }

    /**
     * Update a record (uses Primary)
     *
     * Automatically injects current timestamp if table has auto-update field configured.
     *
     * @example
     * const user = await userRepo.update(1, { name: 'Jane' });
     */
    async update(id: number | string, data: any): Promise<TSelect | null>
    {
        return this.executeWithMonitoring('update', async () =>
        {
            const idColumn = this.getIdColumn();

            // Auto-inject timestamp if configured and not explicitly provided
            const updateData = this.injectAutoUpdateTimestamp(data);

            const { eq } = await import('drizzle-orm');
            const writeDb = this.getWriteDb();
            const [result] = await writeDb
                .update(this.table)
                .set(updateData)
                .where(eq(idColumn, id))
                .returning() as TSelect[];

            return result ?? null;
        });
    }

    /**
     * Delete a record (uses Primary)
     *
     * @example
     * const deleted = await userRepo.delete(1);
     */
    async delete(id: number | string): Promise<TSelect | null>
    {
        return this.executeWithMonitoring('delete', async () =>
        {
            const idColumn = this.getIdColumn();

            const { eq } = await import('drizzle-orm');
            const writeDb = this.getWriteDb();
            const [result] = await writeDb
                .delete(this.table)
                .where(eq(idColumn, id))
                .returning() as TSelect[];

            return result ?? null;
        });
    }

    /**
     * Count records (uses Replica)
     *
     * @example
     * const count = await userRepo.count();
     */
    async count(where?: SQL<unknown>): Promise<number>
    {
        return this.executeWithMonitoring('count', async () =>
        {
            const readDb = this.getReadDb();
            return countTotal(readDb, this.table as any, where);
        });
    }

    /**
     * Find records by filters (uses Replica)
     *
     * @example
     * const users = await userRepo.findWhere({ email: { like: '@gmail.com' }, status: 'active' });
     */
    async findWhere(filters: Filters): Promise<TSelect[]>
    {
        return this.executeWithMonitoring('findWhere', async () =>
        {
            const whereCondition = buildFilters(filters, this.table as any);
            const readDb = this.getReadDb();
            return readDb
                .select()
                .from(this.table as any)
                .where(whereCondition) as Promise<TSelect[]>;
        });
    }

    /**
     * Find one record by filters (uses Replica)
     *
     * @example
     * const user = await userRepo.findOneWhere({ email: 'john@example.com' });
     */
    async findOneWhere(filters: Filters): Promise<TSelect | null>
    {
        return this.executeWithMonitoring('findOneWhere', async () =>
        {
            const whereCondition = buildFilters(filters, this.table as any);
            const readDb = this.getReadDb();
            const [result] = await readDb
                .select()
                .from(this.table as any)
                .where(whereCondition) as TSelect[];

            return result ?? null;
        });
    }

    /**
     * Check if record exists by ID (uses Replica)
     *
     * @example
     * const exists = await userRepo.exists(1);
     */
    async exists(id: number | string): Promise<boolean>
    {
        return this.executeWithMonitoring('exists', async () =>
        {
            const idColumn = this.getIdColumn();

            const { eq } = await import('drizzle-orm');
            const readDb = this.getReadDb();
            const [result] = await readDb
                .select()
                .from(this.table as any)
                .where(eq(idColumn, id))
                .limit(1) as TSelect[];

            return !!result;
        });
    }

    /**
     * Check if record exists by filters (uses Replica)
     *
     * @example
     * const exists = await userRepo.existsBy({ email: 'john@example.com' });
     */
    async existsBy(filters: Filters): Promise<boolean>
    {
        return this.executeWithMonitoring('existsBy', async () =>
        {
            const whereCondition = buildFilters(filters, this.table as any);
            const readDb = this.getReadDb();
            const [result] = await readDb
                .select()
                .from(this.table as any)
                .where(whereCondition)
                .limit(1) as TSelect[];

            return !!result;
        });
    }

    /**
     * Count records by filters (uses Replica)
     *
     * @example
     * const count = await userRepo.countBy({ status: 'active' });
     */
    async countBy(filters: Filters): Promise<number>
    {
        return this.executeWithMonitoring('countBy', async () =>
        {
            const whereCondition = buildFilters(filters, this.table as any);
            const readDb = this.getReadDb();
            return countTotal(readDb, this.table as any, whereCondition);
        });
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
        return this.executeWithMonitoring('saveMany', async () =>
        {
            const writeDb = this.getWriteDb();
            return writeDb
                .insert(this.table)
                .values(data)
                .returning() as Promise<TSelect[]>;
        });
    }

    /**
     * Update multiple records by filters (uses Primary)
     *
     * Automatically injects current timestamp if table has auto-update field configured.
     *
     * @example
     * const count = await userRepo.updateWhere({ status: 'inactive' }, { status: 'archived' });
     */
    async updateWhere(filters: Filters, data: any): Promise<number>
    {
        return this.executeWithMonitoring('updateWhere', async () =>
        {
            // Auto-inject timestamp if configured and not explicitly provided
            const updateData = this.injectAutoUpdateTimestamp(data);

            const whereCondition = buildFilters(filters, this.table as any);
            const writeDb = this.getWriteDb();
            const results = await writeDb
                .update(this.table)
                .set(updateData)
                .where(whereCondition)
                .returning() as TSelect[];

            return results.length;
        });
    }

    /**
     * Delete multiple records by filters (uses Primary)
     *
     * @example
     * const count = await userRepo.deleteWhere({ status: 'banned' });
     */
    async deleteWhere(filters: Filters): Promise<number>
    {
        return this.executeWithMonitoring('deleteWhere', async () =>
        {
            const whereCondition = buildFilters(filters, this.table as any);
            const writeDb = this.getWriteDb();
            const results = await writeDb
                .delete(this.table)
                .where(whereCondition)
                .returning() as TSelect[];

            return results.length;
        });
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
}