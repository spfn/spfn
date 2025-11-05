/**
 * @spfn/auth - Permissions Entity
 *
 * Granular permissions for RBAC system
 *
 * Features:
 * - Built-in permissions (auth:*, user:*, rbac:*) - required for package
 * - System permissions (preset permissions) - optional
 * - Custom permissions (app-specific) - defined by developers
 * - Category grouping for organization
 */

import { text, boolean, index } from 'drizzle-orm/pg-core';
import { id, timestamps, createFunctionSchema } from '@spfn/core/db';

const schema = createFunctionSchema('@spfn/auth');

export const permissions = schema.table('permissions',
    {
        // Primary key
        id: id(),

        // Permission identifier (e.g., 'user:delete', 'post:publish')
        // Format: resource:action or namespace:resource:action
        // Must be unique
        name: text('name').notNull().unique(),

        // Display name for UI
        displayName: text('display_name').notNull(),

        // Permission description
        description: text('description'),

        // Category for grouping (e.g., 'user', 'post', 'admin', 'system')
        category: text('category'),

        // Built-in permission flag
        // true: Core package permissions - cannot be deleted
        // false: Custom or preset permissions
        isBuiltin: boolean('is_builtin').notNull().default(false),

        // System permission flag
        // true: Defined in code (builtin or preset)
        // false: Runtime created custom permission
        isSystem: boolean('is_system').notNull().default(false),

        // Active status
        // false: Deactivated permission (not enforced)
        isActive: boolean('is_active').notNull().default(true),

        ...timestamps(),
    },
    (table) => [
        index('permissions_name_idx').on(table.name),
        index('permissions_category_idx').on(table.category),
        index('permissions_is_system_idx').on(table.isSystem),
        index('permissions_is_active_idx').on(table.isActive),
        index('permissions_is_builtin_idx').on(table.isBuiltin),
    ]
);

// Type exports
export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;