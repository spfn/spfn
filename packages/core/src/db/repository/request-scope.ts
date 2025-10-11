/**
 * Request-Scoped Repository Pattern
 *
 * Provides request-level repository caching using AsyncLocalStorage.
 *
 * ## Benefits:
 * - ✅ **Automatic isolation**: Each request gets its own repository cache
 * - ✅ **Memory efficient**: Cache cleared automatically after request ends
 * - ✅ **Test-friendly**: No global state, tests are fully isolated
 * - ✅ **DI-compatible**: Can inject custom repositories easily
 * - ✅ **Zero overhead**: Uses existing AsyncLocalStorage infrastructure
 *
 * ## vs Global Singleton:
 *
 * | Feature | Global Singleton | Request-Scoped |
 * |---------|-----------------|----------------|
 * | Memory | Permanent cache | Request-only cache |
 * | Test isolation | Manual clearRepositoryCache() | Automatic |
 * | Thread-safety | Shared state | Isolated per request |
 * | DI support | Difficult | Easy |
 *
 * @example
 * ```typescript
 * // 1. Add middleware (routes automatically)
 * import { RepositoryScope } from '@spfn/core/db';
 *
 * app.use(RepositoryScope());
 *
 * // 2. Use in service (same request = same instance)
 * import { getScopedRepository } from '@spfn/core/db';
 *
 * export async function createPost(data) {
 *   const repo = getScopedRepository(posts, PostRepository); // First call - creates
 *   const existing = await repo.findBySlug(slug);
 *   return repo.save(data); // Same instance
 * }
 *
 * // 3. Different request = different cache (automatic)
 * ```
 */

import { AsyncLocalStorage } from 'async_hooks';
import { Repository } from './repository.js';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { MiddlewareHandler } from 'hono';

/**
 * AsyncLocalStorage for request-scoped repository cache
 * Each request gets its own Map instance
 */
const repositoryStorage = new AsyncLocalStorage<Map<string, Repository<any>>>();

/**
 * Generate cache key from table and repository class
 * Same logic as global singleton for consistency
 */
function getCacheKey<TTable extends PgTable>(
    table: TTable,
    RepositoryClass?: new (table: TTable) => Repository<TTable>
): string
{
    const tableName = (table as any)[Symbol.for('drizzle:Name')]
        || (table as any).name
        || table.toString();

    const className = RepositoryClass?.name || 'Repository';

    return `${tableName}:${className}`;
}

/**
 * Execute function within a repository scope
 *
 * Creates a new request-scoped cache for the duration of the function.
 * Automatically cleaned up after function completes.
 *
 * @param fn - Async function to execute within scope
 * @returns Result of the function
 *
 * @example
 * ```typescript
 * // Middleware
 * app.use(async (c, next) => {
 *   return withRepositoryScope(() => next());
 * });
 *
 * // Manual usage
 * const result = await withRepositoryScope(async () => {
 *   const repo = getScopedRepository(users);
 *   return repo.findAll();
 * });
 * ```
 */
export function withRepositoryScope<T>(fn: () => Promise<T>): Promise<T>
{
    const cache = new Map<string, Repository<any>>();
    return repositoryStorage.run(cache, fn);
}

/**
 * Get request-scoped repository instance
 *
 * Returns cached instance within the same request, creates new instance for new requests.
 * Falls back to creating a new instance if called outside of a repository scope.
 *
 * ## Behavior:
 * - **Inside scope**: Returns cached instance (same request = same instance)
 * - **Outside scope**: Creates new instance every time (graceful degradation)
 *
 * @param table - Drizzle table definition
 * @param RepositoryClass - Optional custom Repository class
 * @returns Repository instance (cached or new)
 *
 * @example
 * ```typescript
 * // Base Repository
 * const repo = getScopedRepository(users);
 * await repo.findById(1);
 *
 * // Custom Repository
 * class UserRepository extends Repository<typeof users> {
 *   async findByEmail(email: string) {
 *     return this.findOneWhere({ email });
 *   }
 * }
 *
 * const repo = getScopedRepository(users, UserRepository);
 * await repo.findByEmail('john@example.com');
 *
 * // Within same request - returns cached instance
 * const repo2 = getScopedRepository(users, UserRepository); // Same instance!
 * ```
 */
export function getScopedRepository<
    TTable extends PgTable,
    TRepo extends Repository<TTable> = Repository<TTable>
>(
    table: TTable,
    RepositoryClass?: new (table: TTable) => TRepo
): TRepo
{
    const cache = repositoryStorage.getStore();

    // Outside scope - create new instance (graceful degradation)
    if (!cache)
    {
        return RepositoryClass
            ? new RepositoryClass(table)
            : new Repository(table) as TRepo;
    }

    // Inside scope - use cache
    const key = getCacheKey(table, RepositoryClass as any);
    let repo = cache.get(key);

    if (!repo)
    {
        repo = RepositoryClass
            ? new RepositoryClass(table)
            : new Repository(table);
        cache.set(key, repo);
    }

    return repo as TRepo;
}

/**
 * Hono middleware for automatic repository scope management
 *
 * Wraps each request in a repository scope, ensuring automatic cache isolation.
 * All repositories accessed via getScopedRepository() within this request will be cached.
 *
 * @returns Hono middleware handler
 *
 * @example
 * ```typescript
 * // Global middleware (recommended)
 * import { createServer } from '@spfn/core';
 * import { RepositoryScope } from '@spfn/core/db';
 *
 * const app = createServer();
 * app.use(RepositoryScope());
 *
 * // Or in server.config.ts
 * export default {
 *   middlewares: [
 *     { name: 'repositoryScope', handler: RepositoryScope() }
 *   ]
 * };
 * ```
 */
export function RepositoryScope(): MiddlewareHandler
{
    return async (_c, next) =>
    {
        return withRepositoryScope(() => next());
    };
}

/**
 * Get current repository cache size (for debugging/monitoring)
 *
 * Returns the number of cached repository instances in the current request scope.
 * Returns 0 if called outside a scope.
 *
 * @returns Number of cached repositories in current scope
 *
 * @example
 * ```typescript
 * const size = getScopedCacheSize();
 * console.log(`Cached repositories in this request: ${size}`);
 * ```
 */
export function getScopedCacheSize(): number
{
    const cache = repositoryStorage.getStore();
    return cache?.size ?? 0;
}

/**
 * Check if currently inside a repository scope
 *
 * @returns true if inside scope, false otherwise
 *
 * @example
 * ```typescript
 * if (isInRepositoryScope()) {
 *   console.log('Using scoped cache');
 * } else {
 *   console.log('Creating new instances');
 * }
 * ```
 */
export function isInRepositoryScope(): boolean
{
    return repositoryStorage.getStore() !== undefined;
}