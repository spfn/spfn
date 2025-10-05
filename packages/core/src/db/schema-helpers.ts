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
 * updatedAt can be manually updated in your application logic.
 *
 * @returns Object with createdAt and updatedAt columns
 *
 * @example
 * ```typescript
 * export const users = pgTable('users', {
 *     id: id(),
 *     email: text('email'),
 *     ...timestamps(),
 * });
 * ```
 */
export function timestamps()
{
    return {
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .defaultNow()
            .notNull(),
    };
}

/**
 * Foreign key reference to another table
 *
 * Creates a bigserial column with cascade delete.
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
export function foreignKey(
    name: string,
    reference: () => any,
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
export function optionalForeignKey(
    name: string,
    reference: () => any,
    options?: { onDelete?: 'cascade' | 'set null' | 'restrict' | 'no action' }
)
{
    return bigserial(`${name}_id`, { mode: 'number' })
        .references(reference, { onDelete: options?.onDelete ?? 'set null' });
}