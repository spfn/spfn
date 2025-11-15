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
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { getDatabase } from './manager';
import { getTransaction } from './transaction';

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
}