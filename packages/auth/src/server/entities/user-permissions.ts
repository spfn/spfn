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

import { bigint, boolean, text, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { id, timestamps, createFunctionSchema } from '@spfn/core/db';
import { users } from './users';
import { permissions } from './permissions';

const schema = createFunctionSchema('@spfn/auth');

export const userPermissions = schema.table('user_permissions',
    {
        // Primary key
        id: id(),

        // Foreign key to users table
        userId: bigint('user_id', { mode: 'number' })
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),

        // Foreign key to permissions table
        permissionId: bigint('permission_id', { mode: 'number' })
            .notNull()
            .references(() => permissions.id, { onDelete: 'cascade' }),

        // Grant or revoke
        // true: Grant this permission (even if role doesn't have it)
        // false: Revoke this permission (even if role has it)
        granted: boolean('granted').notNull().default(true),

        // Reason for grant/revocation (audit trail)
        reason: text('reason'),

        // Expiration timestamp (optional)
        // null: Permanent override
        // timestamp: Permission expires at this time
        expiresAt: timestamp('expires_at', { withTimezone: true }),

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