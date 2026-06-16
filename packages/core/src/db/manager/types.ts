/**
 * Database Manager Types
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * DB connection type
 */
export type DbConnectionType = 'read' | 'write';

/**
 * GetDatabase function type
 */
export type GetDatabaseFn = (type?: DbConnectionType) => PostgresJsDatabase<Record<string, unknown>>;
