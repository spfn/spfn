/**
 * @spfn/auth - User-Permissions Override Entity
 *
 * Per-user permission grants/revocations
 *
 * Features:
 * - Grant additional permissions to specific users
 * - Revoke role-inherited permissions from specific users
 * - Temporary permissions with expiration
 * - Audit trail with reason field
 *
 * Priority:
 * User permissions override role permissions
 */

import { boolean, text, index, unique } from 'drizzle-orm/pg-core';
import { id, timestamps, utcTimestamp, foreignKey } from '@spfn/core/db';
import { users } from './users';
import { permissions } from './permissions';
import { authSchema } from './schema';

export const userPermissions = authSchema.table('user_permissions',
    {
        // Primary key
        id: id(),

        // User reference
        // Foreign key to users table
        // Cascade delete: when user is deleted, all overrides are removed
        userId: foreignKey('user', () => users.id, { onDelete: 'cascade' }),

        // Permission reference
        // Foreign key to permissions table
        // Cascade delete: when permission is deleted, all overrides are removed
        permissionId: foreignKey('permission', () => permissions.id, { onDelete: 'cascade' }),

        // Grant or revoke flag
        // true: GRANT this permission to the user (additive override)
        //       - Grants permission even if role doesn't have it
        //       - Use case: Temporary elevated access, special privileges
        //       - Example: Grant 'post:delete' to specific editor for cleanup task
        // false: REVOKE this permission from the user (subtractive override)
        //        - Removes permission even if role has it
        //        - Use case: Restrict specific actions, compliance requirements
        //        - Example: Revoke 'user:delete' from admin during audit period
        // Priority: User permissions ALWAYS override role permissions
        granted: boolean('granted').notNull().default(true),

        // Reason for grant/revocation
        // Used for: audit trail, compliance documentation
        // Example: "Temporary access for project X", "Security incident - restricted"
        reason: text('reason'),

        // Expiration timestamp (optional)
        // null: Permanent override (remains until manually removed)
        // timestamp: Permission expires at this time (auto-revoked by background job)
        // Use case: Time-limited elevated access, temporary restrictions
        expiresAt: utcTimestamp('expires_at'),

        ...timestamps(),
    },
    (table) => [
        // Indexes for query performance
        index('user_permissions_user_id_idx').on(table.userId),
        index('user_permissions_permission_id_idx').on(table.permissionId),
        index('user_permissions_expires_at_idx').on(table.expiresAt),

        // Unique constraint: one user-permission pair only
        unique('user_permissions_unique').on(table.userId, table.permissionId),
    ]
);

// Type exports
export type UserPermission = typeof userPermissions.$inferSelect;
export type NewUserPermission = typeof userPermissions.$inferInsert;