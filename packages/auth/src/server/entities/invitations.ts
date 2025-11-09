/**
 * @spfn/auth - User Invitations Entity
 *
 * Invitation system for invite-only user registration
 *
 * Features:
 * - Email-based invitations with unique tokens
 * - Role assignment at invitation time
 * - Expiration and status tracking
 * - Audit trail (who invited whom, when accepted)
 * - Metadata support for custom data
 */

import { text, timestamp, bigint, index, jsonb } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';
import { roles } from './roles';
import { users } from './users';
import { authSchema } from './schema';

export const invitations = authSchema.table('user_invitations',
    {
        // Primary key
        id: id(),

        // Target email address for the invitation
        // Will become the user's email upon acceptance
        email: text('email').notNull(),

        // Unique invitation token (UUID v4)
        // Used in invitation URL: /auth/invite/{token}
        // Single-use token that expires after acceptance
        token: text('token').notNull().unique(),

        // Role to be assigned when invitation is accepted
        // Foreign key to roles table
        roleId: bigint('role_id', { mode: 'number' })
            .references(() => roles.id)
            .notNull(),

        // User who created this invitation
        // Foreign key to users table
        // Used for: audit trail, permission checks
        invitedBy: bigint('invited_by', { mode: 'number' })
            .references(() => users.id)
            .notNull(),

        // Invitation status
        // - pending: Invitation sent, awaiting acceptance
        // - accepted: User accepted and account created
        // - expired: Invitation expired (automatic)
        // - cancelled: Invitation cancelled by admin
        status: text(
            'status',
            {
                enum: ['pending', 'accepted', 'expired', 'cancelled']
            }
        ).notNull().default('pending'),

        // Expiration timestamp (default: 7 days from creation)
        // Invitation cannot be accepted after this time
        // Background job should update status to 'expired'
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

        // Timestamp when invitation was accepted
        // null = not yet accepted
        // Used for: audit trail, analytics
        acceptedAt: timestamp('accepted_at', { withTimezone: true }),

        // Timestamp when invitation was cancelled
        // null = not cancelled
        // Used for: audit trail
        cancelledAt: timestamp('cancelled_at', { withTimezone: true }),

        // Additional metadata (JSONB)
        // Use cases:
        // - Custom welcome message
        // - Onboarding instructions
        // - Team/department assignment
        // - Custom fields for app-specific data
        // Example: { message: "Welcome!", department: "Engineering" }
        metadata: jsonb('metadata'),

        ...timestamps(),
    },
    (table) => [
        // Indexes for query optimization
        index('invitations_token_idx').on(table.token),
        index('invitations_email_idx').on(table.email),
        index('invitations_status_idx').on(table.status),
        index('invitations_invited_by_idx').on(table.invitedBy),
        index('invitations_expires_at_idx').on(table.expiresAt), // For cleanup jobs
        index('invitations_role_id_idx').on(table.roleId),
    ]
);

// Type exports
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

// Helper type with joined data
export type InvitationWithDetails = Invitation &
{
    role: {
        id: number;
        name: string;
        displayName: string;
    };
    inviter: {
        id: number;
        email: string | null;
    };
};