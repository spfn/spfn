/**
 * @spfn/auth - Users Entity
 *
 * Main user table supporting multiple authentication methods
 */

import { text, timestamp, check } from 'drizzle-orm/pg-core';
import { id, timestamps, createFunctionSchema } from '@spfn/core/db';
import { sql } from 'drizzle-orm';

const schema = createFunctionSchema('@spfn/auth');

export const users = schema.table('users',
    {
        // Identity
        id: id(),
        email: text('email').unique(),
        phone: text('phone').unique(), // E.164 format: +821012345678

        // Authentication
        passwordHash: text('password_hash'),

        // Authorization
        role: text(
            'role',
            {
                enum: ['superadmin', 'admin', 'user']
            }
        ).notNull().default('user'),

        status: text(
            'status',
            {
                enum: ['active', 'inactive', 'suspended']
            }
        ).notNull().default('active'),

        // Verification (timestamp based)
        emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
        phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),

        // Metadata
        lastLoginAt: timestamp('last_login_at', { withTimezone: true }),

        ...timestamps(),
    },
    (table) => [
        // At least one of email or phone must be provided
        check(
            'email_or_phone_check',
            sql`${table.email} IS NOT NULL OR ${table.phone} IS NOT NULL`
        ),
    ]
);

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = 'superadmin' | 'admin' | 'user';
export type UserStatus = 'active' | 'inactive' | 'suspended';

// Helper type with computed verification status
export type UserWithVerification = User &
{
    isEmailVerified: boolean;
    isPhoneVerified: boolean;
};