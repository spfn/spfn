/**
 * @spfn/monitor - Logs Entity
 *
 * Developer logs stored in DB for retrieval via admin dashboard.
 * Supports level-based filtering, source tracking, and metadata.
 */

import { text, jsonb, index } from 'drizzle-orm/pg-core';
import { id, timestamps, enumText } from '@spfn/core/db';
import { monitorSchema } from './schema';

/**
 * Log level types
 */
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const;
export type LogLevel = typeof LOG_LEVELS[number];

/**
 * Logs table — developer log entries
 */
export const logs = monitorSchema.table('logs',
    {
        // Primary Key
        id: id(),

        // Log data
        level: enumText('level', LOG_LEVELS).notNull(),
        message: text('message').notNull(),
        source: text('source'),

        // Request context
        requestId: text('request_id'),
        userId: text('user_id'),

        // Extra data
        metadata: jsonb('metadata').$type<Record<string, unknown>>(),

        ...timestamps(),
    },
    (table) => [
        index('monitor_log_level_idx').on(table.level),
        index('monitor_log_source_idx').on(table.source),
        index('monitor_log_created_at_idx').on(table.createdAt),
    ],
);

export type Log = typeof logs.$inferSelect;
export type NewLog = typeof logs.$inferInsert;
