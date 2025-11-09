/**
 * @spfn/auth - Verification Codes Entity
 *
 * Stores verification codes for email and phone verification
 * Codes expire after a configurable time period
 */

import { text, timestamp, index } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';
import { authSchema } from './schema';

export const verificationCodes = authSchema.table('verification_codes',
    {
        id: id(),

        // Target (email or phone)
        target: text('target').notNull(), // Email address or E.164 phone number
        targetType: text(
            'target_type',
            {
                enum: ['email', 'phone']
            }
        ).notNull(),

        // Code
        code: text('code').notNull(), // 6-digit code by default (configurable)

        // Purpose
        purpose: text(
            'purpose',
            {
                enum: ['registration', 'login', 'password_reset', 'email_change', 'phone_change']
            }
        ).notNull(),

        // Expiry
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

        // Usage tracking
        usedAt: timestamp('used_at', { withTimezone: true }),
        attempts: text('attempts').notNull().default('0'), // Track failed verification attempts

        ...timestamps(),
    },
    (table) => [
        // Index for quick lookup by target and purpose
        index('target_purpose_idx')
            .on(table.target, table.purpose, table.expiresAt),
    ]
);

// Type exports
export type VerificationCode = typeof verificationCodes.$inferSelect;
export type NewVerificationCode = typeof verificationCodes.$inferInsert;
export type VerificationTargetType = 'email' | 'phone';
export type VerificationPurpose = 'registration' | 'login' | 'password_reset' | 'email_change' | 'phone_change';