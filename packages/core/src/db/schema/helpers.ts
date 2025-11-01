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
import { bigserial, timestamp, text, uuid as pgUuid } from 'drizzle-orm/pg-core';

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

/**
 * UUID primary key
 *
 * Creates a UUID column as primary key with automatic default value generation.
 * Useful for distributed systems or when you need globally unique identifiers.
 *
 * @returns uuid primary key column with gen_random_uuid() default
 *
 * @example
 * ```typescript
 * export const sessions = pgTable('sessions', {
 *     id: uuid(),
 *     userId: foreignKey('user', () => users.id),
 *     ...timestamps(),
 * });
 * ```
 */
export function uuid()
{
    return pgUuid('id').defaultRandom().primaryKey();
}

/**
 * Audit fields for tracking record creators and updaters
 *
 * Adds createdBy and updatedBy fields for user tracking.
 * Typically stores user IDs, emails, or usernames.
 *
 * @returns Object with createdBy and updatedBy columns
 *
 * @example
 * ```typescript
 * export const posts = pgTable('posts', {
 *     id: id(),
 *     title: text('title'),
 *     ...timestamps(),
 *     ...auditFields(),
 * });
 *
 * // Usage in route
 * await db.insert(posts).values({
 *     title: 'New Post',
 *     createdBy: currentUser.email,
 * });
 * ```
 */
export function auditFields()
{
    return {
        createdBy: text('created_by'),
        updatedBy: text('updated_by'),
    };
}

/**
 * Publishing fields for content management
 *
 * Tracks when and by whom content was published.
 * Useful for CMS, blog posts, articles, etc.
 *
 * @returns Object with publishedAt and publishedBy columns
 *
 * @example
 * ```typescript
 * export const articles = pgTable('articles', {
 *     id: id(),
 *     title: text('title'),
 *     status: text('status'), // draft/published/archived
 *     ...publishingFields(),
 *     ...timestamps(),
 * });
 *
 * // Publishing an article
 * await db.update(articles)
 *     .set({
 *         status: 'published',
 *         publishedAt: new Date(),
 *         publishedBy: currentUser.email,
 *     })
 *     .where(eq(articles.id, articleId));
 * ```
 */
export function publishingFields()
{
    return {
        publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
        publishedBy: text('published_by'),
    };
}

/**
 * Custom verification timestamp field
 *
 * Creates a nullable timestamp field for tracking verification status.
 * Useful for email verification, phone verification, etc.
 *
 * @param fieldName - Field name in camelCase (e.g., 'emailVerified', 'phoneVerified')
 * @returns Object with verification timestamp column (converts to snake_case + '_at')
 *
 * @example
 * ```typescript
 * export const users = pgTable('users', {
 *     id: id(),
 *     email: text('email'),
 *     phone: text('phone'),
 *     ...verificationTimestamp('emailVerified'),  // emailVerifiedAt -> email_verified_at
 *     ...verificationTimestamp('phoneVerified'),  // phoneVerifiedAt -> phone_verified_at
 *     ...timestamps(),
 * });
 *
 * // Verify email
 * await db.update(users)
 *     .set({ emailVerifiedAt: new Date() })
 *     .where(eq(users.email, userEmail));
 * ```
 */
export function verificationTimestamp(fieldName: string)
{
    // Convert camelCase to snake_case and add '_at' suffix
    const columnName = fieldName
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '') + '_at';

    return {
        [fieldName + 'At']: timestamp(columnName, { withTimezone: true, mode: 'date' }),
    };
}

/**
 * Soft delete fields
 *
 * Adds deletedAt and deletedBy for logical deletion.
 * Records are marked as deleted instead of being physically removed.
 *
 * @returns Object with deletedAt and deletedBy columns
 *
 * @example
 * ```typescript
 * export const posts = pgTable('posts', {
 *     id: id(),
 *     title: text('title'),
 *     ...timestamps(),
 *     ...softDelete(),
 * });
 *
 * // Soft delete
 * await db.update(posts)
 *     .set({
 *         deletedAt: new Date(),
 *         deletedBy: currentUser.email,
 *     })
 *     .where(eq(posts.id, postId));
 *
 * // Query only non-deleted records
 * const activePosts = await db.select()
 *     .from(posts)
 *     .where(isNull(posts.deletedAt));
 * ```
 */
export function softDelete()
{
    return {
        deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
        deletedBy: text('deleted_by'),
    };
}

/**
 * Type-safe status enum field
 *
 * Creates a status text column with enum constraint and default value.
 * Provides compile-time type safety for status values.
 *
 * @param statuses - Array of status values (at least 2 required)
 * @param defaultStatus - Default status value (defaults to first status)
 * @returns Status column with enum constraint
 *
 * @example
 * ```typescript
 * // Basic usage
 * export const posts = pgTable('posts', {
 *     id: id(),
 *     title: text('title'),
 *     status: statusEnum(['draft', 'published', 'archived'] as const),
 *     ...timestamps(),
 * });
 *
 * // With custom default
 * export const users = pgTable('users', {
 *     id: id(),
 *     email: text('email'),
 *     status: statusEnum(['active', 'inactive', 'suspended'] as const, 'active'),
 *     ...timestamps(),
 * });
 *
 * // TypeScript infers the type
 * type PostStatus = 'draft' | 'published' | 'archived';
 * ```
 */
export function statusEnum<T extends readonly [string, ...string[]]>(
    statuses: T,
    defaultStatus?: T[number]
)
{
    return text('status', { enum: statuses as any })
        .notNull()
        .default((defaultStatus ?? statuses[0]) as any);
}