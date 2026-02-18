/**
 * @spfn/monitor - Error Groups Entity
 *
 * Groups errors by fingerprint (name + message + path) to avoid
 * duplicate tracking. Tracks count, status, and first/last seen times.
 */

import { text, integer, index } from 'drizzle-orm/pg-core';
import { id, timestamps, enumText, utcTimestamp } from '@spfn/core/db';
import { monitorSchema } from './schema';

/**
 * Error group status types
 */
export const ERROR_GROUP_STATUSES = ['active', 'resolved', 'ignored'] as const;
export type ErrorGroupStatus = typeof ERROR_GROUP_STATUSES[number];

/**
 * Error groups table — groups errors by fingerprint
 */
export const errorGroups = monitorSchema.table('error_groups',
    {
        // Primary Key
        id: id(),

        // Business Key — SHA-256 first 16 hex chars of (name:message:path)
        fingerprint: text('fingerprint').notNull().unique(),

        // Error identification
        name: text('name').notNull(),
        message: text('message').notNull(),
        path: text('path').notNull(),
        method: text('method').notNull(),
        statusCode: integer('status_code').notNull(),

        // Status
        status: enumText('status', ERROR_GROUP_STATUSES).default('active').notNull(),

        // Counters
        count: integer('count').notNull().default(1),

        // Timeline
        firstSeenAt: utcTimestamp('first_seen_at').notNull(),
        lastSeenAt: utcTimestamp('last_seen_at').notNull(),
        resolvedAt: utcTimestamp('resolved_at'),

        ...timestamps(),
    },
    (table) => [
        index('monitor_eg_fingerprint_idx').on(table.fingerprint),
        index('monitor_eg_status_idx').on(table.status),
        index('monitor_eg_last_seen_at_idx').on(table.lastSeenAt),
        index('monitor_eg_path_idx').on(table.path),
    ]
);

export type ErrorGroup = typeof errorGroups.$inferSelect;
export type NewErrorGroup = typeof errorGroups.$inferInsert;
