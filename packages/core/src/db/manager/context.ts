/**
 * DB Context Helper
 *
 * Automatically detects transaction context and returns the appropriate DB instance.
 *
 * ✅ Implemented:
 * - AsyncLocalStorage-based transaction detection
 * - Returns default DB instance when no transaction
 * - JPA-style Repository pattern support
 * - Preserves Drizzle core features
 *
 * ⚠️ TODO:
 * - Nested transaction detection and warning logs
 * - Transaction timeout checks
 *
 * 💡 Future considerations:
 * - Add function to force default DB usage (useDefaultDb)
 * - Auto-select Read Replica (detect read-only queries)
 * - Transaction statistics collection (success/failure/rollback count)
 * - Return transaction ID function (for debugging)
 *
 * 🔗 Related files:
 * - src/utils/async-context.ts (AsyncLocalStorage implementation)
 * - src/utils/transaction.ts (Transactional middleware)
 * - src/db/db-instance.ts (Default DB instance)
 * - src/db/wrapped-db.ts (WrappedDb implementation)
 * - src/db/repository.ts (Repository implementation)
 */
import { getTransaction } from '../transaction/index.js';

import { getDatabase, type DbConnectionType } from './manager.js';
import { WrappedDb } from './wrapped-db.js';

/**
 * Get DB instance (WrappedDb)
 *
 * - If transaction context exists: Returns transaction DB
 * - Otherwise: Returns default DB or specified connection type
 * - Wraps with WrappedDb to provide both Repository pattern + Drizzle features
 *
 * Usage 1: Direct Drizzle use
 * ```typescript
 * export async function GET(c: RouteContext) {
 *   const db = getDb();
 *   const users = await db.select().from(users);
 *   return c.json(users);
 * }
 * ```
 *
 * Usage 2: Repository pattern
 * ```typescript
 * export async function GET(c: RouteContext) {
 *   const db = getDb();
 *   const userRepo = db.for(users);
 *   const result = await userRepo.findPage(pageable);
 *   return c.json(result);
 * }
 * ```
 *
 * Usage 3: Specify connection type
 * ```typescript
 * const readDb = getDb('read');   // Use read replica
 * const writeDb = getDb('write'); // Use primary
 * ```
 *
 * @param type - Optional connection type ('read' or 'write')
 * @returns WrappedDb instance (transaction or specified DB)
 */
export function getDb(type?: DbConnectionType): WrappedDb
{
    const tx = getTransaction();

    // If transaction exists, always use transaction DB
    if (tx)
    {
        return new WrappedDb(tx);
    }

    // Otherwise use specified type or default from manager
    const rawDb = getDatabase(type);
    if (!rawDb)
    {
        throw new Error(
            'Database not initialized. ' +
            'Set DATABASE_URL environment variable or call initDatabase() first.'
        );
    }

    return new WrappedDb(rawDb);
}