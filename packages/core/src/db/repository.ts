/**
 * Base Repository Pattern
 *
 * Provides automatic database instance management with transaction context support.
 * Eliminates the need for manual `getDatabaseOrThrow()` calls in repository classes.
 *
 * Features:
 * - Automatic transaction context detection and usage
 * - Read/Write connection separation (with replica support)
 * - Type-safe schema generics
 * - Consistent database access pattern across all repositories
 * - Enhanced error tracking with repository context
 *
 * @example Basic Repository
 * ```typescript
 * import { BaseRepository } from '@spfn/core/db';
 * import { users } from './schema';
 * import { eq } from 'drizzle-orm';
 *
 * export class UserRepository extends BaseRepository {
 *     async findById(id: string) {
 *         // Uses read replica when available
 *         return await this.readDb
 *             .select()
 *             .from(users)
 *             .where(eq(users.id, id));
 *     }
 *
 *     async create(data: NewUser) {
 *         // Uses write primary
 *         return await this.db
 *             .insert(users)
 *             .values(data)
 *             .returning();
 *     }
 * }
 * ```
 *
 * @example With Transactions
 * ```typescript
 * import { runWithTransaction } from '@spfn/core/db';
 *
 * const userRepo = new UserRepository();
 *
 * await runWithTransaction(async () => {
 *     // Both db and readDb automatically use the transaction context
 *     const user = await userRepo.create({ name: 'John' });
 *     await userRepo.findById(user.id); // Uses same transaction
 * });
 * ```
 *
 * @example With Custom Schema Type
 * ```typescript
 * import type { AppSchema } from './schema';
 *
 * export class UserRepository extends BaseRepository<AppSchema> {
 *     // Now this.db and this.readDb are typed with AppSchema
 * }
 * ```
 *
 * @example With Enhanced Error Tracking
 * ```typescript
 * export class UserRepository extends BaseRepository {
 *     async updateStatus(id: string, status: string) {
 *         // Errors will include repository context automatically
 *         return await this.db
 *             .update(users)
 *             .set({ status })
 *             .where(eq(users.id, id))
 *             .returning();
 *     }
 * }
 * // On error: logs will show "UserRepository" context
 * ```
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { SQL } from 'drizzle-orm';
import { count as sqlCount } from 'drizzle-orm';
import type { PgTable, PgColumn } from 'drizzle-orm/pg-core';
import { getDatabase } from './manager';
import { getTransaction } from './transaction';
import { isSQLWrapper, buildWhereFromObject } from './query-utils';

/**
 * Enhanced error class that includes repository context
 */
export class RepositoryError extends Error
{
    constructor(
        message: string,
        public readonly repository: string,
        public readonly method?: string,
        public readonly table?: string,
        public readonly originalError?: Error
    )
    {
        super(message);
        this.name = 'RepositoryError';

        // Preserve original stack trace if available
        if (originalError?.stack)
        {
            this.stack = originalError.stack;
        }
    }
}

/**
 * Base Repository class for database operations
 *
 * Provides automatic database instance management with transaction support.
 * Extend this class to create domain-specific repositories.
 *
 * The repository automatically detects if running within a transaction context
 * and uses the appropriate database instance:
 * - Inside transaction: Uses transaction DB
 * - Outside transaction: Uses global DB instance (with read/write separation)
 *
 * @template TSchema - Database schema type (defaults to Record<string, unknown>)
 */
export abstract class BaseRepository<TSchema extends Record<string, unknown> = Record<string, unknown>>
{
    /**
     * Write database instance
     *
     * Automatically resolves to:
     * - Transaction DB if running within transaction context
     * - Global write (primary) instance otherwise
     *
     * Use this for INSERT, UPDATE, DELETE operations.
     *
     * @example
     * ```typescript
     * async create(data: NewUser) {
     *     return await this.db.insert(users).values(data).returning();
     * }
     * ```
     */
    protected get db(): PostgresJsDatabase<TSchema>
    {
        // Transaction context takes precedence
        const txDb = getTransaction();
        if (txDb)
        {
            return txDb as PostgresJsDatabase<TSchema>;
        }

        // Fall back to global write instance
        return getDatabase('write') as PostgresJsDatabase<TSchema>;
    }

    /**
     * Read database instance
     *
     * Automatically resolves to:
     * - Transaction DB if running within transaction context
     * - Global read (replica) instance otherwise
     *
     * Use this for SELECT operations to leverage read replicas
     * and reduce load on the primary database.
     *
     * @example
     * ```typescript
     * async findById(id: string) {
     *     return await this.readDb
     *         .select()
     *         .from(users)
     *         .where(eq(users.id, id));
     * }
     * ```
     */
    protected get readDb(): PostgresJsDatabase<TSchema>
    {
        // Transaction context takes precedence
        const txDb = getTransaction();
        if (txDb)
        {
            return txDb as PostgresJsDatabase<TSchema>;
        }

        // Fall back to global read instance (uses replica if configured)
        return getDatabase('read') as PostgresJsDatabase<TSchema>;
    }

    /**
     * Wrap query execution with repository context
     *
     * Enhances error messages with repository information to make debugging easier.
     * When an error occurs, it will include:
     * - Repository class name
     * - Method name
     * - Table name (if provided)
     * - Original error details
     *
     * @param queryFn - Query function to execute
     * @param context - Context information (operation name, table name, etc.)
     * @returns Query result
     * @throws RepositoryError with enhanced context
     *
     * @example
     * ```typescript
     * async findById(id: number) {
     *     return await this.withContext(
     *         () => this.readDb.select().from(users).where(eq(users.id, id)),
     *         { method: 'findById', table: 'users' }
     *     );
     * }
     * ```
     */
    protected async withContext<T>(
        queryFn: () => Promise<T>,
        context: { method?: string; table?: string } = {}
    ): Promise<T>
    {
        try
        {
            return await queryFn();
        }
        catch (error)
        {
            const err = error instanceof Error ? error : new Error(String(error));
            const repositoryName = this.constructor.name;

            // Create enhanced error with repository context
            throw new RepositoryError(
                err.message,
                repositoryName,
                context.method,
                context.table,
                err
            );
        }
    }

    // ============================================================================
    // CRUD Methods
    // ============================================================================

    /**
     * Find a single record
     *
     * @param table - Drizzle table schema
     * @param where - Object or SQL condition
     * @returns Single record or null
     *
     * @example
     * ```typescript
     * // Object-based
     * const user = await this._findOne(users, { id: 1 });
     *
     * // SQL-based
     * const user = await this._findOne(users, eq(users.id, 1));
     * ```
     */
    protected async _findOne<T extends PgTable>(
        table: T,
        where: Record<string, any> | SQL | undefined
    ): Promise<T['$inferSelect'] | null>
    {
        const whereClause = isSQLWrapper(where)
            ? where
            : where ? buildWhereFromObject(table, where as Record<string, any>) : undefined;

        if (!whereClause)
        {
            throw new Error('findOne requires at least one where condition');
        }

        const results = await this.readDb.select().from(table as PgTable).where(whereClause).limit(1);
        return (results[0] as T['$inferSelect']) ?? null;
    }

    /**
     * Find multiple records
     *
     * @param table - Drizzle table schema
     * @param options - Query options
     * @returns Array of records
     *
     * @example
     * ```typescript
     * const users = await this._findMany(users, {
     *     where: { active: true },
     *     orderBy: desc(users.createdAt),
     *     limit: 10
     * });
     * ```
     */
    protected async _findMany<T extends PgTable>(
        table: T,
        options?: {
            where?: Record<string, any> | SQL | undefined;
            orderBy?: SQL | SQL[];
            limit?: number;
            offset?: number;
        }
    ): Promise<T['$inferSelect'][]>
    {
        let query = this.readDb.select().from(table as PgTable);

        // Apply where
        if (options?.where)
        {
            const whereClause = isSQLWrapper(options.where)
                ? options.where
                : options.where ? buildWhereFromObject(table, options.where as Record<string, any>) : undefined;

            if (whereClause)
            {
                query = query.where(whereClause) as any;
            }
        }

        // Apply orderBy
        if (options?.orderBy)
        {
            const orderByArray = Array.isArray(options.orderBy) ? options.orderBy : [options.orderBy];
            query = query.orderBy(...orderByArray) as any;
        }

        // Apply limit
        if (options?.limit)
        {
            query = query.limit(options.limit) as any;
        }

        // Apply offset
        if (options?.offset)
        {
            query = query.offset(options.offset) as any;
        }

        return query as Promise<T['$inferSelect'][]>;
    }

    /**
     * Create a new record
     *
     * @param table - Drizzle table schema
     * @param data - Insert data
     * @returns Created record
     *
     * @example
     * ```typescript
     * const user = await this._create(users, {
     *     email: 'test@example.com',
     *     name: 'Test User'
     * });
     * ```
     */
    protected async _create<T extends PgTable>(
        table: T,
        data: T['$inferInsert']
    ): Promise<T['$inferSelect']>
    {
        const [result] = await this.db.insert(table).values(data).returning();
        return result as T['$inferSelect'];
    }

    /**
     * Create multiple records
     *
     * @param table - Drizzle table schema
     * @param data - Array of insert data
     * @returns Array of created records
     *
     * @example
     * ```typescript
     * const users = await this._createMany(users, [
     *     { email: 'user1@example.com', name: 'User 1' },
     *     { email: 'user2@example.com', name: 'User 2' }
     * ]);
     * ```
     */
    protected async _createMany<T extends PgTable>(
        table: T,
        data: T['$inferInsert'][]
    ): Promise<T['$inferSelect'][]>
    {
        const results = await this.db.insert(table).values(data).returning();
        return results as T['$inferSelect'][];
    }

    /**
     * Upsert a record (INSERT or UPDATE on conflict)
     *
     * @param table - Drizzle table schema
     * @param data - Insert data
     * @param options - Conflict resolution options
     * @returns Upserted record
     *
     * @example
     * ```typescript
     * const cache = await this._upsert(cache, {
     *     key: 'config',
     *     value: {...}
     * }, {
     *     target: [cache.key],
     *     set: { value: data.value, updatedAt: new Date() }
     * });
     * ```
     */
    protected async _upsert<T extends PgTable>(
        table: T,
        data: T['$inferInsert'],
        options: {
            target: PgColumn[];
            set?: Partial<T['$inferInsert']> | Record<string, SQL | any>;
        }
    ): Promise<T['$inferSelect']>
    {
        const [result] = await this.db
            .insert(table)
            .values(data)
            .onConflictDoUpdate({
                target: options.target,
                set: options.set || data,
            })
            .returning();

        return result as T['$inferSelect'];
    }

    /**
     * Update a single record
     *
     * @param table - Drizzle table schema
     * @param where - Object or SQL condition
     * @param data - Update data
     * @returns Updated record or null
     *
     * @example
     * ```typescript
     * const user = await this._updateOne(users,
     *     { id: 1 },
     *     { name: 'Updated Name' }
     * );
     * ```
     */
    protected async _updateOne<T extends PgTable>(
        table: T,
        where: Record<string, any> | SQL | undefined,
        data: Partial<T['$inferInsert']>
    ): Promise<T['$inferSelect'] | null>
    {
        const whereClause = isSQLWrapper(where)
            ? where
            : where ? buildWhereFromObject(table, where as Record<string, any>) : undefined;

        if (!whereClause)
        {
            throw new Error('updateOne requires at least one where condition');
        }

        const [result] = await this.db.update(table).set(data).where(whereClause).returning();
        return (result as T['$inferSelect']) ?? null;
    }

    /**
     * Update multiple records
     *
     * @param table - Drizzle table schema
     * @param where - Object or SQL condition
     * @param data - Update data
     * @returns Array of updated records
     *
     * @example
     * ```typescript
     * const users = await this._updateMany(users,
     *     { role: 'user' },
     *     { verified: true }
     * );
     * ```
     */
    protected async _updateMany<T extends PgTable>(
        table: T,
        where: Record<string, any> | SQL | undefined,
        data: Partial<T['$inferInsert']>
    ): Promise<T['$inferSelect'][]>
    {
        const whereClause = isSQLWrapper(where)
            ? where
            : where ? buildWhereFromObject(table, where as Record<string, any>) : undefined;

        if (!whereClause)
        {
            throw new Error('updateMany requires at least one where condition');
        }

        const results = await this.db.update(table).set(data).where(whereClause).returning();
        return results as T['$inferSelect'][];
    }

    /**
     * Delete a single record
     *
     * @param table - Drizzle table schema
     * @param where - Object or SQL condition
     * @returns Deleted record or null
     *
     * @example
     * ```typescript
     * const user = await this._deleteOne(users, { id: 1 });
     * ```
     */
    protected async _deleteOne<T extends PgTable>(
        table: T,
        where: Record<string, any> | SQL | undefined
    ): Promise<T['$inferSelect'] | null>
    {
        const whereClause = isSQLWrapper(where)
            ? where
            : where ? buildWhereFromObject(table, where as Record<string, any>) : undefined;

        if (!whereClause)
        {
            throw new Error('deleteOne requires at least one where condition');
        }

        const [result] = await this.db.delete(table).where(whereClause).returning();
        return (result as T['$inferSelect']) ?? null;
    }

    /**
     * Delete multiple records
     *
     * @param table - Drizzle table schema
     * @param where - Object or SQL condition
     * @returns Array of deleted records
     *
     * @example
     * ```typescript
     * const users = await this._deleteMany(users, { verified: false });
     * ```
     */
    protected async _deleteMany<T extends PgTable>(
        table: T,
        where: Record<string, any> | SQL | undefined
    ): Promise<T['$inferSelect'][]>
    {
        const whereClause = isSQLWrapper(where)
            ? where
            : where ? buildWhereFromObject(table, where as Record<string, any>) : undefined;

        if (!whereClause)
        {
            throw new Error('deleteMany requires at least one where condition');
        }

        const results = await this.db.delete(table).where(whereClause).returning();
        return results as T['$inferSelect'][];
    }

    /**
     * Count records
     *
     * @param table - Drizzle table schema
     * @param where - Optional object or SQL condition
     * @returns Number of records
     *
     * @example
     * ```typescript
     * const total = await this._count(users);
     * const activeUsers = await this._count(users, { active: true });
     * ```
     */
    protected async _count<T extends PgTable>(
        table: T,
        where?: Record<string, any> | SQL | undefined
    ): Promise<number>
    {
        let query = this.readDb.select({ count: sqlCount() }).from(table as PgTable);

        if (where)
        {
            const whereClause = isSQLWrapper(where)
                ? where
                : where ? buildWhereFromObject(table, where as Record<string, any>) : undefined;

            if (whereClause)
            {
                query = query.where(whereClause) as any;
            }
        }

        const [result] = await query;
        return Number(result?.count ?? 0);
    }
}