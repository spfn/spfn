/**
 * Database Manager Types
 */

import type { PgAsyncDatabase, PgAsyncTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * DB connection type
 */
export type DbConnectionType = 'read' | 'write';

/**
 * Common base for PostgreSQL Drizzle drivers.
 *
 * Both the built-in postgres.js database and externally supplied drivers such
 * as PGlite extend this class.
 */
export type DrizzleDatabase = PgAsyncDatabase<any, any>;

/** Default database type used by the environment-backed postgres.js path. */
export type DefaultDatabase = PostgresJsDatabase;

/** Resolve the transaction type belonging to a PostgreSQL Drizzle database. */
export type DatabaseTransaction<TDatabase extends DrizzleDatabase> =
    TDatabase extends PgAsyncDatabase<infer TQueryResult, infer TRelations>
        ? PgAsyncTransaction<TQueryResult, TRelations>
        : never;

/**
 * An externally owned PostgreSQL Drizzle database.
 *
 * The provider owns connection creation. SPFN calls `close` at most once when
 * `closeDatabase()` or server shutdown releases the registered provider.
 */
export interface DatabaseProvider<TDatabase extends DrizzleDatabase = DrizzleDatabase>
{
    /** Primary database for writes (and reads when no replica is supplied). */
    write: TDatabase;
    /** Optional read replica. Falls back to `write`. */
    read?: TDatabase;
    /** Driver identifier used for diagnostics, for example `pglite`. */
    kind: string;
    /** Release provider-owned resources. */
    close?: () => void | Promise<void>;
}

/**
 * GetDatabase function type
 */
export type GetDatabaseFn = (type?: DbConnectionType) => DrizzleDatabase;
