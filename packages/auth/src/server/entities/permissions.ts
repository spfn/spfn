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

import { PERMISSION_CATEGORIES } from "../rbac";
import { text, boolean, index } from 'drizzle-orm/pg-core';
import { id, timestamps, enumText, typedJsonb } from '@spfn/core/db';
import { authSchema } from './schema';

export const permissions = authSchema.table('permissions',
    {
        // Primary key
        id: id(),

        // Permission identifier
        // Format: resource:action or namespace:resource:action
        // Examples:
        // - Simple: 'user:delete', 'post:publish'
        // - Namespaced: 'auth:user:delete', 'cms:post:publish'
        // Must be unique across all permissions
        // Used in: permission checks, role assignments, API guards
        name: text('name').notNull().unique(),

        // Display name for UI
        // Human-readable name shown in admin panels
        // Example: "Delete Users", "Publish Posts"
        displayName: text('display_name').notNull(),

        // Permission description
        // Detailed explanation of what this permission allows
        // Example: "Allows deletion of user accounts from the system"
        description: text('description'),

        // Category for grouping
        // Used for: organizing permissions in UI, filtering
        // Built-in categories: auth, user, rbac, system
        // Custom categories: any app-specific category
        category: enumText('category', PERMISSION_CATEGORIES),

        // Built-in permission flag
        // true: Core package permissions (auth:*, user:*, rbac:*)
        //       - Cannot be deleted or modified
        //       - Must have isSystem = true
        //       - Required for package functionality
        // false: Custom or preset permissions
        //        - Can be deleted (if not system)
        isBuiltin: boolean('is_builtin').notNull().default(false),

        // System permission flag
        // true: Defined in code (builtin or preset)
        //       - Deletion restricted
        //       - Created during migrations or initialization
        // false: Runtime created custom permission
        //        - Fully manageable by admins
        //        - Created through admin UI or API
        isSystem: boolean('is_system').notNull().default(false),

        // Active status
        // true: Permission is enforced (default)
        // false: Deactivated permission (not enforced in checks)
        //        - Useful for temporarily disabling features
        //        - Maintains audit trail without deletion
        isActive: boolean('is_active').notNull().default(true),

        // Additional metadata (JSONB)
        // Use cases:
        // - UI configuration: { icon: 'trash', color: 'red', group: 'dangerous' }
        // - Access control: { requiresMfa: true, ipWhitelist: ['10.0.0.0/8'] }
        // - Dependencies: { requires: ['user:read'], conflicts: ['user:admin'] }
        // - Audit: { createdBy: 123, source: 'migration', version: '1.0.0' }
        // Example: { icon: 'trash', color: 'red', requiresMfa: true }
        metadata: typedJsonb<Record<string, any>>('metadata'),

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
export type PermissionEntity = typeof permissions.$inferSelect;
export type NewPermissionEntity = typeof permissions.$inferInsert;

// Legacy alias for backward compatibility
export type Permission = PermissionEntity;
export type NewPermission = NewPermissionEntity;