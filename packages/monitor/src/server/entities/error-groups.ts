/**
 * @spfn/monitor - Error Groups Entity
 *
 * Groups errors by fingerprint (name + message + path) to avoid
 * duplicate tracking. Tracks count, status, and first/last seen times.
 */

import { text, integer, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
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
        // pg_trgm GIN indexes make the admin search's leading-wildcard ILIKE
        // (%term%) on name/message/path sargable instead of a seq scan. Error
        // groups are fingerprint-deduped, so insert volume is low — the write cost
        // of these GIN indexes is acceptable here (NOT applied to the high-volume
        // logs table). Requires the pg_trgm extension (see the migration).
        index('monitor_eg_name_trgm_idx').using('gin', sql`${table.name} gin_trgm_ops`),
        index('monitor_eg_message_trgm_idx').using('gin', sql`${table.message} gin_trgm_ops`),
        index('monitor_eg_path_trgm_idx').using('gin', sql`${table.path} gin_trgm_ops`),
    ],
);

export type ErrorGroup = typeof errorGroups.$inferSelect;
export type NewErrorGroup = typeof errorGroups.$inferInsert;
