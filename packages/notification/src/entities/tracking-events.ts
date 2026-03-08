/**
 * @spfn/notification - Tracking Events Entity
 *
 * Stores email engagement tracking events (opens, clicks)
 */

import { integer, text, index } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';
import { notificationSchema } from './schema';

/**
 * Tracking event types
 */
export const TRACKING_EVENT_TYPES = ['open', 'click'] as const;
export type TrackingEventType = typeof TRACKING_EVENT_TYPES[number];

/**
 * Tracking events table - stores email engagement events
 */
export const trackingEvents = notificationSchema.table('tracking_events',
    {
        id: id(),

        /**
         * Reference to history.id (notification that was tracked)
         */
        notificationId: integer('notification_id').notNull(),

        /**
         * Event type (open or click)
         */
        type: text('type', { enum: TRACKING_EVENT_TYPES }).notNull(),

        /**
         * Original URL (click events only)
         */
        linkUrl: text('link_url'),

        /**
         * Link position index in the email (click events only)
         */
        linkIndex: integer('link_index'),

        /**
         * IP address of the requester
         */
        ipAddress: text('ip_address'),

        /**
         * User agent string of the requester
         */
        userAgent: text('user_agent'),

        ...timestamps(),
    },
    (table) => [
        index('te_notification_id_idx').on(table.notificationId),
        index('te_type_idx').on(table.type),
        index('te_created_at_idx').on(table.createdAt),
    ]
);

/**
 * Type inference
 */
export type TrackingEvent = typeof trackingEvents.$inferSelect;
export type NewTrackingEvent = typeof trackingEvents.$inferInsert;
