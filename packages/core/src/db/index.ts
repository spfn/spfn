/**
 * Database Module Exports
 *
 * Entry point for DB module (Pure re-export only)
 */

// DB Instance & Connection
export { db, getRawDb } from './db-instance.js';
export type { DbConnectionType } from './db-instance.js';

// Schema Helpers
export { id, timestamps, foreignKey, optionalForeignKey } from './schema-helpers.js';