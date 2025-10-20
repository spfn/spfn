/**
 * Base Repository Class
 *
 * Simple base class for database operations with automatic:
 * - Transaction context detection
 * - Read/Write database separation
 * - Type-safe query builders
 */
import { PgTable } from "drizzle-orm/pg-core";
import { db as writeDb, getDatabase } from "../manager";
import { getTransactionContext, type TransactionDB } from "../transaction";

/**
 * Drizzle table type with utility methods
 */
export interface DrizzleTableWithUtils extends PgTable
{
    getTableName: () => string;
}

/**
 * Base Repository class for database operations
 *
 * Provides base query builders that automatically use the correct database instance:
 * - In a transaction: Uses transaction context
 * - Read operations: Uses read replica if available
 * - Write operations: Uses primary database
 *
 * @example
 * ```typescript
 * import { Repository } from '@spfn/core/db/repository';
 * import { users } from './schema';
 *
 * class UserRepository extends Repository<typeof users> {
 *   async findById(id: string) {
 *     const query = this.select();
 *     return query.where(eq(this.table.id, id)).limit(1);
 *   }
 *
 *   async create(data: InsertUser) {
 *     const query = this.insert();
 *     return query.values(data).returning();
 *   }
 * }
 *
 * const userRepo = new UserRepository(users);
 * const user = await userRepo.findById('123');
 * ```
 *
 * @example
 * ```typescript
 * // Inside a transaction
 * export const middlewares = [Transactional()];
 *
 * export async function POST(c: RouteContext) {
 *   const userRepo = new UserRepository(users);
 *   // Automatically uses transaction context
 *   await userRepo.create({ name: 'John' });
 * }
 * ```
 */
export class Repository<TTable extends DrizzleTableWithUtils>
{
    constructor(protected table: TTable) {}

    /**
     * Get read database instance
     *
     * Priority:
     * 1. Transaction context (if in a transaction)
     * 2. Read replica (if available)
     * 3. Primary database (fallback)
     */
    protected get readDb(): TransactionDB
    {
        // If in transaction, use transaction context
        const context = getTransactionContext();
        if (context)
        {
            return context.tx;
        }

        // Use read replica if available
        const db = getDatabase('read');
        if (db)
        {
            return db;
        }

        // Fallback to write database
        if (!writeDb)
        {
            throw new Error(
                'Database not initialized. Call initDatabase() first.'
            );
        }

        return writeDb;
    }

    /**
     * Get write database instance
     *
     * Priority:
     * 1. Transaction context (if in a transaction)
     * 2. Primary database
     */
    protected get writeDb(): TransactionDB
    {
        // If in transaction, use transaction context
        const context = getTransactionContext();
        if (context)
        {
            return context.tx;
        }

        // Use primary database
        if (!writeDb)
        {
            throw new Error(
                'Database not initialized. Call initDatabase() first.'
            );
        }

        return writeDb;
    }

    /**
     * Create a SELECT query builder
     *
     * Uses read database (replica if available, or transaction context if in transaction)
     *
     * @returns Drizzle query builder for SELECT operations
     */
    protected select()
    {
        return this.readDb.select().from(this.table as PgTable);
    }

    /**
     * Create an INSERT query builder
     *
     * Uses write database (or transaction context if in transaction)
     *
     * @returns Drizzle query builder for INSERT operations
     */
    protected insert()
    {
        return this.writeDb.insert(this.table as PgTable);
    }

    /**
     * Create an UPDATE query builder
     *
     * Uses write database (or transaction context if in transaction)
     *
     * @returns Drizzle query builder for UPDATE operations
     */
    protected update()
    {
        return this.writeDb.update(this.table as PgTable);
    }

    /**
     * Create a DELETE query builder
     *
     * Uses write database (or transaction context if in transaction)
     *
     * @returns Drizzle query builder for DELETE operations
     */
    protected delete()
    {
        return this.writeDb.delete(this.table as PgTable);
    }
}