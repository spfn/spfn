/**
 * @spfn/auth - Users Entity
 *
 * Main user table supporting multiple authentication methods
 *
 * Features:
 * - Email or phone-based registration
 * - Password authentication (bcrypt)
 * - OAuth support (nullable passwordHash)
 * - Role-based access control (RBAC)
 * - Account status management
 * - Email/phone verification
 */

import { USER_STATUSES } from "../types";
import { text, check, boolean, bigint, index } from 'drizzle-orm/pg-core';
import { id, timestamps, enumText, utcTimestamp } from '@spfn/core/db';
import { sql } from 'drizzle-orm';
import { roles } from './roles';
import { authSchema } from './schema';

export const users = authSchema.table('users',
    {
        // Identity
        id: id(),

        // Email address (unique identifier)
        // Used for: login, password reset, notifications
        email: text('email').unique(),

        // Phone number in E.164 international format
        // Format: +[country code][number] (e.g., +821012345678)
        // Used for: SMS login, 2FA, notifications
        phone: text('phone').unique(),

        // Authentication
        // Bcrypt password hash ($2b$10$[salt][hash], 60 chars)
        // Nullable to support OAuth-only accounts
        passwordHash: text('password_hash'),

        // Force password change on next login
        // Use cases: initial setup, security breach, policy violation
        passwordChangeRequired: boolean('password_change_required').notNull().default(false),

        // Authorization (Role-Based Access Control)
        // Foreign key to roles table
        // References built-in roles: user (default), admin, superadmin
        // Can also reference custom roles created at runtime
        roleId: bigint('role_id', { mode: 'number' })
            .references(() => roles.id)
            .notNull(),

        // Account status
        // - active: Normal operation (default)
        // - inactive: Deactivated (user request, dormant)
        // - suspended: Locked (security incident, ToS violation)
        status: enumText('status', USER_STATUSES).default('active').notNull(),

        // Verification timestamps
        // null = unverified, timestamp = verified at this time
        // Email verification (via verification code or magic link)
        emailVerifiedAt: utcTimestamp('email_verified_at'),

        // Phone verification (via SMS OTP)
        phoneVerifiedAt: utcTimestamp('phone_verified_at'),

        // Metadata
        // Last successful login timestamp
        // Used for: security auditing, dormant account detection
        lastLoginAt: utcTimestamp('last_login_at'),

        ...timestamps(),
    },
    (table) => [
        // Database constraints
        // Ensure at least one identifier exists (email OR phone)
        check(
            'email_or_phone_check',
            sql`${table.email} IS NOT NULL OR ${table.phone} IS NOT NULL`
        ),

        // Indexes for query optimization
        index('users_email_idx').on(table.email),
        index('users_phone_idx').on(table.phone),
        index('users_status_idx').on(table.status),
        index('users_role_id_idx').on(table.roleId),
    ]
);

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;