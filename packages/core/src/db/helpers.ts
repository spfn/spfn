/**
 * Database Helper Functions
 *
 * Type-safe helper functions for common database operations.
 * Automatically handles:
 * - Transaction context detection
 * - Read/Write database separation
 * - Type inference from table schema
 *
 * @example
 * ```typescript
 * // Simple object-based where
 * const user = await findOne(users, { id: 1 });
 * const labels = await findMany(cmsLabels, { section: 'hero' });
 *
 * // Complex SQL-based where
 * const user = await findOne(users, and(eq(users.id, 1), gt(users.age, 18)));
 * const labels = await findMany(cmsLabels, {
 *     where: or(like(cmsLabels.key, 'hero.%'), eq(cmsLabels.section, 'footer')),
 *     limit: 10
 * });
 * ```
 */

import type { SQL } from 'drizzle-orm';
import { eq, and } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { getDatabase } from './manager';

/**
 * Infer SELECT model from PgTable
 */
type InferSelectModel<T extends PgTable> = T['$inferSelect'];

/**
 * Infer INSERT model from PgTable
 */
type InferInsertModel<T extends PgTable> = T['$inferInsert'];

/**
 * Object-based where condition (AND only, equality only)
 */
type WhereObject<T> = {
    [K in keyof T]?: T[K];
};

/**
 * Check if value is SQL wrapper
 */
function isSQLWrapper(value: any): value is SQL
{
    return value && typeof value === 'object' && 'queryChunks' in value;
}

/**
 * Build SQL WHERE clause from object
 */
function buildWhereFromObject<T extends PgTable>(
    table: T,
    where: WhereObject<InferSelectModel<T>>
): SQL | undefined
{
    const entries = Object.entries(where).filter(([_, value]) => value !== undefined);
    if (entries.length === 0) return undefined;

    const conditions = entries.map(([key, value]) =>
        eq((table as any)[key], value)
    );

    return conditions.length === 1 ? conditions[0] : and(...conditions);
}

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
 * const user = await findOne(users, { id: 1 });
 * const label = await findOne(cmsLabels, { key: 'hero.title', section: 'hero' });
 *
 * // SQL-based
 * const user = await findOne(users, and(eq(users.id, 1), gt(users.age, 18)));
 * ```
 */
export async function findOne<T extends PgTable>(
    table: T,
    where: WhereObject<InferSelectModel<T>>
): Promise<InferSelectModel<T> | null>;

export async function findOne<T extends PgTable>(
    table: T,
    where: SQL | undefined
): Promise<InferSelectModel<T> | null>;

export async function findOne<T extends PgTable>(
    table: T,
    where: WhereObject<InferSelectModel<T>> | SQL | undefined
): Promise<InferSelectModel<T> | null>
{
    const db = getDatabase('read');
    if (!db)
    {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }

    const whereClause = isSQLWrapper(where)
        ? where
        : where ? buildWhereFromObject(table, where as WhereObject<InferSelectModel<T>>) : undefined;

    if (!whereClause)
    {
        throw new Error('findOne requires at least one where condition');
    }

    const results = await db.select().from(table as PgTable).where(whereClause).limit(1);
    return (results[0] as InferSelectModel<T>) ?? null;
}

/**
 * Find multiple records
 *
 * @param table - Drizzle table schema
 * @param options - Query options (where, orderBy, limit, offset)
 * @returns Array of records
 *
 * @example
 * ```typescript
 * // Simple object where
 * const labels = await findMany(cmsLabels, { section: 'hero' });
 *
 * // With options
 * const labels = await findMany(cmsLabels, {
 *     where: { section: 'hero' },
 *     orderBy: desc(cmsLabels.updatedAt),
 *     limit: 10,
 *     offset: 0
 * });
 *
 * // Complex SQL where
 * const labels = await findMany(cmsLabels, {
 *     where: and(
 *         like(cmsLabels.key, 'hero.%'),
 *         eq(cmsLabels.section, 'hero')
 *     ),
 *     limit: 10
 * });
 * ```
 */
export async function findMany<T extends PgTable>(
    table: T,
    options?: {
        where?: WhereObject<InferSelectModel<T>> | SQL | undefined;
        orderBy?: SQL | SQL[];
        limit?: number;
        offset?: number;
    }
): Promise<InferSelectModel<T>[]>
{
    const db = getDatabase('read');
    if (!db)
    {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }

    let query = db.select().from(table as PgTable);

    // Apply where
    if (options?.where)
    {
        const whereClause = isSQLWrapper(options.where)
            ? options.where
            : options.where ? buildWhereFromObject(table, options.where as WhereObject<InferSelectModel<T>>) : undefined;

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

    return query as Promise<InferSelectModel<T>[]>;
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
 * const user = await create(users, {
 *     email: 'test@example.com',
 *     name: 'Test User'
 * });
 * ```
 */
export async function create<T extends PgTable>(
    table: T,
    data: InferInsertModel<T>
): Promise<InferSelectModel<T>>
{
    const db = getDatabase('write');
    if (!db)
    {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }

    const [result] = await db.insert(table).values(data).returning();
    return result as InferSelectModel<T>;
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
 * const users = await createMany(users, [
 *     { email: 'user1@example.com', name: 'User 1' },
 *     { email: 'user2@example.com', name: 'User 2' }
 * ]);
 * ```
 */
export async function createMany<T extends PgTable>(
    table: T,
    data: InferInsertModel<T>[]
): Promise<InferSelectModel<T>[]>
{
    const db = getDatabase('write');
    if (!db)
    {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }

    const results = await db.insert(table).values(data).returning();
    return results as InferSelectModel<T>[];
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
 * // Object-based where
 * const user = await updateOne(users, { id: 1 }, { name: 'Updated Name' });
 *
 * // SQL-based where
 * const user = await updateOne(users, eq(users.id, 1), { name: 'Updated Name' });
 * ```
 */
export async function updateOne<T extends PgTable>(
    table: T,
    where: WhereObject<InferSelectModel<T>> | SQL | undefined,
    data: Partial<InferInsertModel<T>>
): Promise<InferSelectModel<T> | null>
{
    const db = getDatabase('write');
    if (!db)
    {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }

    const whereClause = isSQLWrapper(where)
        ? where
        : where ? buildWhereFromObject(table, where as WhereObject<InferSelectModel<T>>) : undefined;

    if (!whereClause)
    {
        throw new Error('updateOne requires at least one where condition');
    }

    const [result] = await db.update(table).set(data).where(whereClause).returning();
    return (result as InferSelectModel<T>) ?? null;
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
 * const users = await updateMany(users,
 *     { role: 'user' },
 *     { verified: true }
 * );
 * ```
 */
export async function updateMany<T extends PgTable>(
    table: T,
    where: WhereObject<InferSelectModel<T>> | SQL | undefined,
    data: Partial<InferInsertModel<T>>
): Promise<InferSelectModel<T>[]>
{
    const db = getDatabase('write');
    if (!db)
    {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }

    const whereClause = isSQLWrapper(where)
        ? where
        : where ? buildWhereFromObject(table, where as WhereObject<InferSelectModel<T>>) : undefined;

    if (!whereClause)
    {
        throw new Error('updateMany requires at least one where condition');
    }

    const results = await db.update(table).set(data).where(whereClause).returning();
    return results as InferSelectModel<T>[];
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
 * // Object-based where
 * const user = await deleteOne(users, { id: 1 });
 *
 * // SQL-based where
 * const user = await deleteOne(users, eq(users.id, 1));
 * ```
 */
export async function deleteOne<T extends PgTable>(
    table: T,
    where: WhereObject<InferSelectModel<T>> | SQL | undefined
): Promise<InferSelectModel<T> | null>
{
    const db = getDatabase('write');
    if (!db)
    {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }

    const whereClause = isSQLWrapper(where)
        ? where
        : where ? buildWhereFromObject(table, where as WhereObject<InferSelectModel<T>>) : undefined;

    if (!whereClause)
    {
        throw new Error('deleteOne requires at least one where condition');
    }

    const [result] = await db.delete(table).where(whereClause).returning();
    return (result as InferSelectModel<T>) ?? null;
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
 * const users = await deleteMany(users, { verified: false });
 * ```
 */
export async function deleteMany<T extends PgTable>(
    table: T,
    where: WhereObject<InferSelectModel<T>> | SQL | undefined
): Promise<InferSelectModel<T>[]>
{
    const db = getDatabase('write');
    if (!db)
    {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }

    const whereClause = isSQLWrapper(where)
        ? where
        : where ? buildWhereFromObject(table, where as WhereObject<InferSelectModel<T>>) : undefined;

    if (!whereClause)
    {
        throw new Error('deleteMany requires at least one where condition');
    }

    const results = await db.delete(table).where(whereClause).returning();
    return results as InferSelectModel<T>[];
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
 * const total = await count(users);
 * const activeUsers = await count(users, { active: true });
 * const adults = await count(users, gt(users.age, 18));
 * ```
 */
export async function count<T extends PgTable>(
    table: T,
    where?: WhereObject<InferSelectModel<T>> | SQL | undefined
): Promise<number>
{
    const db = getDatabase('read');
    if (!db)
    {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }

    let query = db.select().from(table as PgTable);

    if (where)
    {
        const whereClause = isSQLWrapper(where)
            ? where
            : where ? buildWhereFromObject(table, where as WhereObject<InferSelectModel<T>>) : undefined;

        if (whereClause)
        {
            query = query.where(whereClause) as any;
        }
    }

    const results = await query;
    return results.length;
}
