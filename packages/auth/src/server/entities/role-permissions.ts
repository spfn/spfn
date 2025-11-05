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
import { id, timestamps, createFunctionSchema } from '@spfn/core/db';
import { roles } from './roles';
import { permissions } from './permissions';

const schema = createFunctionSchema('@spfn/auth');

export const rolePermissions = schema.table('role_permissions',
    {
        // Primary key
        id: id(),

        // Foreign key to roles table
        roleId: bigint('role_id', { mode: 'number' })
            .notNull()
            .references(() => roles.id, { onDelete: 'cascade' }),

        // Foreign key to permissions table
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