/**
 * Repository Factory
 *
 * Provides singleton instances of Repository classes to prevent unnecessary instantiation
 * and ensure consistent instances across the application.
 *
 * ✅ Features:
 * - Singleton pattern for both base and custom Repository classes
 * - Automatic caching based on table + constructor
 * - Type-safe with full IDE autocomplete
 * - Supports multiple services accessing the same repository
 * - Memory efficient (single instance per table/class combination)
 *
 * @example
 * ```typescript
 * // Base Repository
 * const userRepo = getRepository(users);
 * await userRepo.findById(1);
 *
 * // Custom Repository
 * class UserRepository extends Repository<typeof users> {
 *   async findByEmail(email: string) {
 *     return this.findOneWhere({ email });
 *   }
 * }
 *
 * const userRepo = getRepository(users, UserRepository);
 * await userRepo.findByEmail('john@example.com');
 * ```
 */

import { Repository } from './repository.js';
import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * Repository instance cache
 * Key format: "tableName:ClassName"
 */
const repositoryCache = new Map<string, Repository<any>>();

/**
 * Generate cache key from table and constructor
 *
 * @param table - Drizzle table definition
 * @param RepositoryClass - Optional custom Repository class
 * @returns Cache key string
 */
function getCacheKey<TTable extends PgTable>(
    table: TTable,
    RepositoryClass?: new (table: TTable) => Repository<TTable>
): string
{
    // Get table name from Drizzle's internal symbol or fallback
    const tableName = (table as any)[Symbol.for('drizzle:Name')]
        || (table as any).name
        || table.toString();

    const className = RepositoryClass?.name || 'Repository';

    return `${tableName}:${className}`;
}

/**
 * Get or create a Repository singleton instance
 *
 * This function ensures that only one instance of each Repository is created,
 * preventing memory waste and ensuring consistency across the application.
 *
 * ✅ Supports both base Repository and custom Repository classes
 * ✅ Returns the same instance on subsequent calls
 * ✅ Type-safe with full IDE autocomplete
 * ✅ Automatically detects transaction context (via Repository internals)
 *
 * ## 🔄 Transaction Handling
 *
 * Repository instances are cached globally, but they automatically detect
 * and use transaction context via AsyncLocalStorage in each method call.
 * This means:
 * - **Same repository instance** can be used both inside and outside transactions
 * - **No need to create separate repository instances** per transaction
 * - **Transaction safety is guaranteed** by AsyncLocalStorage context
 *
 * The Repository internally calls `getTransaction()` on every database operation,
 * ensuring the correct DB instance (transaction or default) is always used.
 *
 * @param table - Drizzle table definition
 * @param RepositoryClass - Optional custom Repository class extending Repository
 * @returns Repository instance (cached singleton)
 *
 * @example
 * ```typescript
 * // Base Repository - simple CRUD
 * import { getRepository } from '@spfn/core/db';
 * import { users } from './entities';
 *
 * export async function getUser(id: number) {
 *   const repo = getRepository(users);
 *   return repo.findById(id);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Custom Repository - with custom methods
 * import { Repository, getRepository } from '@spfn/core/db';
 * import { users } from './entities';
 *
 * class UserRepository extends Repository<typeof users> {
 *   async findByEmail(email: string) {
 *     return this.findOneWhere({ email });
 *   }
 *
 *   async findActiveUsers() {
 *     return this.findWhere({ status: 'active' });
 *   }
 * }
 *
 * export async function getUserByEmail(email: string) {
 *   const repo = getRepository(users, UserRepository);
 *   return repo.findByEmail(email);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Multiple services - same instance
 * // services/users.ts
 * const repo = getRepository(users, UserRepository);  // Instance A
 *
 * // services/auth.ts
 * const repo = getRepository(users, UserRepository);  // Same Instance A
 * ```
 *
 * @example
 * ```typescript
 * // Transaction handling - same instance works everywhere
 * import { getRepository, Transactional } from '@spfn/core/db';
 * import { users } from './entities';
 *
 * const userRepo = getRepository(users);
 *
 * // Outside transaction - uses default DB
 * await userRepo.findById(1);
 *
 * // Inside Transactional() middleware - uses transaction automatically
 * app.use(Transactional());
 * app.post('/', async (c) => {
 *   // Same instance, but now uses transaction DB
 *   await userRepo.save({ email: 'test@example.com' });
 *   return c.json({ success: true });
 * });
 * ```
 */
export function getRepository<
    TTable extends PgTable,
    TRepo extends Repository<TTable> = Repository<TTable>
>(
    table: TTable,
    RepositoryClass?: new (table: TTable) => TRepo
): TRepo
{
    const cacheKey = getCacheKey(table, RepositoryClass as any);

    // Check cache
    let repo = repositoryCache.get(cacheKey);

    if (!repo)
    {
        // Create new instance
        if (RepositoryClass)
        {
            repo = new RepositoryClass(table);
        }
        else
        {
            repo = new Repository(table);
        }

        // Cache it
        repositoryCache.set(cacheKey, repo);
    }

    return repo as TRepo;
}

/**
 * Clear repository cache
 *
 * Removes all cached repository instances. Useful for testing scenarios
 * where you need fresh instances.
 *
 * ⚠️ Warning: Only use this in tests. In production, cached instances
 * should persist throughout the application lifecycle.
 *
 * @example
 * ```typescript
 * import { clearRepositoryCache } from '@spfn/core/db';
 *
 * beforeEach(() => {
 *   clearRepositoryCache();  // Fresh instances for each test
 * });
 * ```
 */
export function clearRepositoryCache(): void
{
    repositoryCache.clear();
}

/**
 * Get cache size (for debugging/monitoring)
 *
 * @returns Number of cached repository instances
 *
 * @example
 * ```typescript
 * const size = getRepositoryCacheSize();
 * console.log(`Cached repositories: ${size}`);
 * ```
 */
export function getRepositoryCacheSize(): number
{
    return repositoryCache.size;
}