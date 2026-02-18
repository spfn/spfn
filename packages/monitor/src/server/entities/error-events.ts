/**
 * @spfn/monitor - Error Events Entity
 *
 * Individual error occurrences linked to an error group.
 * Stores request-specific context (headers, query, stack trace).
 */

import { text, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { id, timestamps, foreignKey } from '@spfn/core/db';
import { monitorSchema } from './schema';
import { errorGroups } from './error-groups';

/**
 * Error events table — individual error occurrences
 */
export const errorEvents = monitorSchema.table('error_events',
    {
        // Primary Key
        id: id(),

        // Foreign Key
        groupId: foreignKey('group', () => errorGroups.id).notNull(),

        // Request context
        requestId: text('request_id'),
        userId: text('user_id'),
        statusCode: integer('status_code').notNull(),

        // Request details
        headers: jsonb('headers').$type<Record<string, string>>(),
        query: jsonb('query').$type<Record<string, string>>(),
        stackTrace: text('stack_trace'),
        metadata: jsonb('metadata').$type<Record<string, unknown>>(),

        ...timestamps(),
    },
    (table) => [
        index('monitor_ee_group_id_idx').on(table.groupId),
        index('monitor_ee_created_at_idx').on(table.createdAt),
        index('monitor_ee_user_id_idx').on(table.userId),
    ]
);

export type ErrorEvent = typeof errorEvents.$inferSelect;
export type NewErrorEvent = typeof errorEvents.$inferInsert;
