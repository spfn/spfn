/**
 * @spfn/auth - Roles Entity
 *
 * Role-based access control (RBAC) roles table
 *
 * Features:
 * - Built-in roles (user, admin, superadmin) - cannot be deleted
 * - System roles (preset roles) - can be deactivated
 * - Custom roles (runtime created) - fully manageable
 * - Priority-based hierarchy
 */

import { text, boolean, integer, index } from 'drizzle-orm/pg-core';
import { id, timestamps, createFunctionSchema } from '@spfn/core/db';

const schema = createFunctionSchema('@spfn/auth');

export const roles = schema.table('roles',
    {
        // Primary key
        id: id(),

        // Role identifier (used in code, e.g., 'admin', 'editor')
        // Must be unique, lowercase, kebab-case recommended
        name: text('name').notNull().unique(),

        // Display name for UI (e.g., 'Administrator', 'Content Editor')
        displayName: text('display_name').notNull(),

        // Role description
        description: text('description'),

        // Built-in role flag
        // true: Core package roles (user, admin, superadmin) - cannot be deleted
        // false: Custom or preset roles - can be deleted
        isBuiltin: boolean('is_builtin').notNull().default(false),

        // System role flag
        // true: Defined in code (builtin or preset) - deletion restricted
        // false: Runtime created custom role - fully manageable
        isSystem: boolean('is_system').notNull().default(false),

        // Active status
        // false: Deactivated role (users cannot be assigned)
        isActive: boolean('is_active').notNull().default(true),

        // Priority level (higher = more privileged)
        // superadmin: 100, admin: 80, user: 10
        // Used for role hierarchy and conflict resolution
        priority: integer('priority').notNull().default(10),

        ...timestamps(),
    },
    (table) => [
        index('roles_name_idx').on(table.name),
        index('roles_is_system_idx').on(table.isSystem),
        index('roles_is_active_idx').on(table.isActive),
        index('roles_is_builtin_idx').on(table.isBuiltin),
        index('roles_priority_idx').on(table.priority),
    ]
);

// Type exports
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;