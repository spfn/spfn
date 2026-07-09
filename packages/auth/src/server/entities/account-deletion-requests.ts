/**
 * @spfn/auth - Account Deletion Requests Entity
 *
 * Audit trail for account deletion/recovery. Rows are never deleted — even after
 * a hard-delete purge — so "who requested/recovered/purged what, when" survives
 * the user row itself (개인정보보호법 제21조 3항 분리 보존 원칙).
 */

import { text, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { id, timestamps, enumText, utcTimestamp, optionalForeignKey } from '@spfn/core/db';
import {
    ACCOUNT_DELETION_REQUEST_STATUSES,
    ACCOUNT_DELETION_REQUESTED_BY,
    PURGE_STRATEGIES,
} from '../types';
import { users } from './users';
import { authSchema } from './schema';

export const accountDeletionRequests = authSchema.table('account_deletion_requests',
    {
        id: id(),

        // Foreign key to users table. `set null` (optionalForeignKey default) so this
        // row survives a hard-delete purge of the user it refers to.
        userId: optionalForeignKey('user', () => users.id),

        // Snapshot of the user's public UUID at request time — stays readable even
        // after userId is nulled out or the account is anonymized.
        userPublicId: text('user_public_id').notNull(),

        // When the deletion was requested
        requestedAt: utcTimestamp('requested_at').notNull().defaultNow(),

        // When the purge job is allowed to run (requestedAt + grace period; equals
        // requestedAt itself for immediate/zero-grace deletions)
        purgeScheduledAt: utcTimestamp('purge_scheduled_at').notNull(),

        // Request lifecycle status
        // - pending: awaiting purgeScheduledAt (or immediate purge)
        // - cancelled: recovered before purge
        // - completed: purge ran
        status: enumText('status', ACCOUNT_DELETION_REQUEST_STATUSES).default('pending').notNull(),

        // Who initiated the request
        requestedBy: enumText('requested_by', ACCOUNT_DELETION_REQUESTED_BY).default('self').notNull(),

        // Optional free-text reason (self-service UI, admin note, DSR reference, ...)
        reason: text('reason'),

        cancelledAt: utcTimestamp('cancelled_at'),
        completedAt: utcTimestamp('completed_at'),

        // Purge strategy actually executed (set on completion; null while pending)
        purgeStrategy: enumText('purge_strategy', PURGE_STRATEGIES),

        ...timestamps(),
    },
    (table) => [
        index('account_deletion_requests_user_id_idx').on(table.userId),
        index('account_deletion_requests_status_idx').on(table.status),
        index('account_deletion_requests_purge_scheduled_at_idx').on(table.purgeScheduledAt),
        index('account_deletion_requests_user_public_id_idx').on(table.userPublicId),

        // Partial unique index: at most one pending request per user at a time.
        uniqueIndex('account_deletion_requests_user_pending_unique_idx')
            .on(table.userId)
            .where(sql`${table.status} = 'pending'`),
    ],
);

// Type exports
export type AccountDeletionRequest = typeof accountDeletionRequests.$inferSelect;
export type NewAccountDeletionRequest = typeof accountDeletionRequests.$inferInsert;
