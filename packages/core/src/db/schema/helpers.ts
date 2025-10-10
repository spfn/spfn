/**
 * Schema Helper Functions
 *
 * Common field patterns for Drizzle ORM entities to reduce boilerplate.
 *
 * @example
 * ```typescript
 * import { pgTable, text } from 'drizzle-orm/pg-core';
 * import { id, timestamps } from '@spfn/core';
 *
 * export const users = pgTable('users', {
 *     id: id(),
 *     email: text('email').unique(),
 *     ...timestamps(),
 * });
 * ```
 */

import type { PgColumn } from 'drizzle-orm/pg-core';
import { bigserial, timestamp } from 'drizzle-orm/pg-core';

/**
 * Standard auto-incrementing primary key
 *
 * @returns bigserial primary key column
 *
 * @example
 * ```typescript
 * export const users = pgTable('users', {
 *     id: id(),
 *     // ...
 * });
 * ```
 */
export function id()
{
    return bigserial('id', { mode: 'number' }).primaryKey();
}

/**
 * Standard timestamp fields (createdAt, updatedAt)
 *
 * Both fields are timezone-aware, auto-set to current time on creation.
 * When autoUpdate is enabled, updatedAt will be automatically updated on record updates.
 *
 * @param options - Optional configuration
 * @param options.autoUpdate - Automatically update updatedAt on record updates (default: false)
 * @returns Object with createdAt and updatedAt columns
 *
 * @example
 * ```typescript
 * // Without auto-update
 * export const users = pgTable('users', {
 *     id: id(),
 *     email: text('email'),
 *     ...timestamps(),
 * });
 *
 * // With auto-update
 * export const posts = pgTable('posts', {
 *     id: id(),
 *     title: text('title'),
 *     ...timestamps({ autoUpdate: true }),
 * });
 * ```
 */
export function timestamps(options?: { autoUpdate?: boolean })
{
    const updatedAtColumn = timestamp('updated_at', { withTimezone: true, mode: 'date' })
        .defaultNow()
        .notNull();

    // Mark column for auto-update if enabled
    if (options?.autoUpdate)
    {
        (updatedAtColumn as any).__autoUpdate = true;
    }

    return {
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .defaultNow()
            .notNull(),
        updatedAt: updatedAtColumn,
    };
}

/**
 * Auto-updating timestamp field (for custom timestamp fields)
 *
 * Creates a timestamp field that automatically updates on record updates.
 * Useful when you need a custom name like 'modifiedAt', 'lastUpdated', etc.
 *
 * @param fieldName - Field name in camelCase (default: 'updatedAt')
 * @returns Object with the timestamp column (converts camelCase to snake_case)
 *
 * @example
 * ```typescript
 * // Custom field name
 * export const posts = pgTable('posts', {
 *     id: id(),
 *     title: text('title'),
 *     ...autoUpdateTimestamp('modifiedAt'),  // Creates 'modified_at' column
 * });
 *
 * // Default field name
 * export const articles = pgTable('articles', {
 *     id: id(),
 *     ...autoUpdateTimestamp(),  // Creates 'updatedAt' -> 'updated_at'
 * });
 * ```
 */
export function autoUpdateTimestamp(fieldName: string = 'updatedAt')
{
    // Convert camelCase to snake_case for column name
    const columnName = fieldName.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');

    const column = timestamp(columnName, { withTimezone: true, mode: 'date' })
        .defaultNow()
        .notNull();

    // Mark column for auto-update
    (column as any).__autoUpdate = true;

    return {
        [fieldName]: column,
    };
}

/**
 * Foreign key reference to another table
 *
 * Creates a bigserial column with cascade delete.
 * Type-safe: ensures the reference points to a valid PostgreSQL column.
 *
 * @param name - Column name (e.g., 'author' creates 'author_id')
 * @param reference - Reference to parent table column
 * @param options - Optional foreign key options
 *
 * @example
 * ```typescript
 * import { users } from './users';
 *
 * export const posts = pgTable('posts', {
 *     id: id(),
 *     authorId: foreignKey('author', () => users.id),
 *     ...timestamps(),
 * });
 * ```
 */
export function foreignKey<T extends PgColumn>(
    name: string,
    reference: () => T,
    options?: { onDelete?: 'cascade' | 'set null' | 'restrict' | 'no action' }
)
{
    return bigserial(`${name}_id`, { mode: 'number' })
        .notNull()
        .references(reference, { onDelete: options?.onDelete ?? 'cascade' });
}

/**
 * Optional foreign key reference (nullable)
 *
 * Type-safe: ensures the reference points to a valid PostgreSQL column.
 *
 * @param name - Column name (e.g., 'author' creates 'author_id')
 * @param reference - Reference to parent table column
 * @param options - Optional foreign key options
 *
 * @example
 * ```typescript
 * export const posts = pgTable('posts', {
 *     id: id(),
 *     authorId: optionalForeignKey('author', () => users.id),
 * });
 * ```
 */
export function optionalForeignKey<T extends PgColumn>(
    name: string,
    reference: () => T,
    options?: { onDelete?: 'cascade' | 'set null' | 'restrict' | 'no action' }
)
{
    return bigserial(`${name}_id`, { mode: 'number' })
        .references(reference, { onDelete: options?.onDelete ?? 'set null' });
}