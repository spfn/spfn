/**
 * @spfn/notification - Notifications Entity
 *
 * Stores notification sending history for tracking and auditing
 */

import { pgTable, text, jsonb, index } from 'drizzle-orm/pg-core';
import { id, timestamps, utcTimestamp } from '@spfn/core/db';

/**
 * Notification channel types
 */
export const NOTIFICATION_CHANNELS = ['email', 'sms', 'slack', 'push'] as const;
export type NotificationChannel = typeof NOTIFICATION_CHANNELS[number];

/**
 * Notification status types
 */
export const NOTIFICATION_STATUSES = ['scheduled', 'pending', 'sent', 'failed', 'cancelled'] as const;
export type NotificationStatus = typeof NOTIFICATION_STATUSES[number];

/**
 * Notifications table - stores all notification sending history
 */
export const notifications = pgTable('spfn_notifications',
    {
        id: id(),

        /**
         * Channel used for sending (email, sms, slack, push)
         */
        channel: text('channel', {
            enum: NOTIFICATION_CHANNELS,
        }).notNull(),

        /**
         * Recipient identifier (email, phone, channel, device token)
         */
        recipient: text('recipient').notNull(),

        /**
         * Template name used (if any)
         */
        templateName: text('template_name'),

        /**
         * Template data used for rendering (JSON)
         */
        templateData: jsonb('template_data'),

        /**
         * Subject (for email) or title
         */
        subject: text('subject'),

        /**
         * Rendered content (text version)
         */
        content: text('content'),

        /**
         * Current status
         */
        status: text('status', {
            enum: NOTIFICATION_STATUSES,
        }).notNull().default('pending'),

        /**
         * Provider message ID (for tracking delivery)
         */
        providerMessageId: text('provider_message_id'),

        /**
         * Provider name used (aws-ses, aws-sns, etc.)
         */
        providerName: text('provider_name'),

        /**
         * Error message if failed
         */
        errorMessage: text('error_message'),

        /**
         * Scheduled send time (for delayed notifications)
         */
        scheduledAt: utcTimestamp('scheduled_at'),

        /**
         * Actual send time
         */
        sentAt: utcTimestamp('sent_at'),

        /**
         * pg-boss job ID (for scheduled notifications, enables cancellation)
         */
        jobId: text('job_id'),

        /**
         * Batch ID (for bulk operations)
         */
        batchId: text('batch_id'),

        /**
         * Reference to related entity (e.g., user_id, order_id)
         */
        referenceType: text('reference_type'),
        referenceId: text('reference_id'),

        ...timestamps(),
    },
    (table) => [
        index('spfn_notifications_channel_idx').on(table.channel),
        index('spfn_notifications_status_idx').on(table.status),
        index('spfn_notifications_recipient_idx').on(table.recipient),
        index('spfn_notifications_created_at_idx').on(table.createdAt),
        index('spfn_notifications_scheduled_at_idx').on(table.scheduledAt),
        index('spfn_notifications_job_id_idx').on(table.jobId),
        index('spfn_notifications_batch_id_idx').on(table.batchId),
        index('spfn_notifications_reference_idx').on(table.referenceType, table.referenceId),
    ]
);

/**
 * Type inference
 */
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
