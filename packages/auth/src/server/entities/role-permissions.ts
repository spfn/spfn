/**
 * @spfn/auth - Role-Permissions Mapping Entity
 *
 * Many-to-many relationship between roles and permissions
 *
 * Usage:
 * - Defines which permissions each role has
 * - Cascade delete when role or permission is deleted
 */

import { bigint, index, unique } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';
import { roles } from './roles';
import { permissions } from './permissions';
import { authSchema } from './schema';

export const rolePermissions = authSchema.table('role_permissions',
    {
        // Primary key
        id: id(),

        // Role reference
        // Foreign key to roles table
        // Cascade delete: when role is deleted, all role-permission mappings are removed
        // Used for: defining which permissions each role has
        // Example: Admin role → [user:create, user:delete, user:update]
        roleId: bigint('role_id', { mode: 'number' })
            .notNull()
            .references(() => roles.id, { onDelete: 'cascade' }),

        // Permission reference
        // Foreign key to permissions table
        // Cascade delete: when permission is deleted, all role-permission mappings are removed
        // Used for: granting permissions to roles
        // Example: user:delete permission → [Admin, Superadmin]
        permissionId: bigint('permission_id', { mode: 'number' })
            .notNull()
            .references(() => permissions.id, { onDelete: 'cascade' }),

        ...timestamps(),
    },
    (table) => [
        // Indexes for query performance
        index('role_permissions_role_id_idx').on(table.roleId),
        index('role_permissions_permission_id_idx').on(table.permissionId),

        // Unique constraint: one role-permission pair only
        unique('role_permissions_unique').on(table.roleId, table.permissionId),
    ]
);

// Type exports
export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;