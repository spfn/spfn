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

import { text, bigint, index } from 'drizzle-orm/pg-core';
import { id, timestamps, enumText, utcTimestamp, typedJsonb } from '@spfn/core/db';
import { INVITATION_STATUSES, type InvitationStatus } from '@/lib/contracts/invitation';
import { roles } from './roles';
import { users } from './users';
import { authSchema } from './schema';

// Re-export for convenience
export { INVITATION_STATUSES, type InvitationStatus };

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
        status: enumText('status', INVITATION_STATUSES).default('pending').notNull(),

        // Expiration timestamp (default: 7 days from creation)
        // Invitation cannot be accepted after this time
        // Background job should update status to 'expired'
        expiresAt: utcTimestamp('expires_at').notNull(),

        // Timestamp when invitation was accepted
        // null = not yet accepted
        // Used for: audit trail, analytics
        acceptedAt: utcTimestamp('accepted_at'),

        // Timestamp when invitation was cancelled
        // null = not cancelled
        // Used for: audit trail
        cancelledAt: utcTimestamp('cancelled_at'),

        // Additional metadata (JSONB)
        // Use cases:
        // - Custom welcome message
        // - Onboarding instructions
        // - Team/department assignment
        // - Custom fields for app-specific data
        // Example: { message: "Welcome!", department: "Engineering" }
        metadata: typedJsonb<Record<string, any>>('metadata'),

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