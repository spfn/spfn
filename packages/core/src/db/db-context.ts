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
import { getTransaction } from '../utils/async-context.js';

import { db as defaultDb } from './db-instance.js';
import { WrappedDb } from './wrapped-db.js';

/**
 * Get DB instance (WrappedDb)
 *
 * - If transaction context exists: Returns transaction DB
 * - Otherwise: Returns default DB
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
 * @returns WrappedDb instance (transaction or default DB)
 */
export function getDb(): WrappedDb
{
    const tx = getTransaction();
    const rawDb = tx ?? defaultDb;
    return new WrappedDb(rawDb);
}