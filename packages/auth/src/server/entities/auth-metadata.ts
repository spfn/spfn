/**
 * @spfn/auth - Auth Metadata Entity
 *
 * Key-value store for auth system metadata
 * Used for storing RBAC config hash and other system-level settings
 */

import { sql } from 'drizzle-orm';
import { text, timestamp } from 'drizzle-orm/pg-core';
import { authSchema } from './schema';

export const authMetadata = authSchema.table('auth_metadata',
    {
        // Metadata key (primary key)
        key: text('key').primaryKey(),

        // Metadata value
        value: text('value').notNull(),

        // Last updated timestamp — stamped by the database on insert and on update
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdate(() => sql`now()`),
    },
);

// Type exports
export type AuthMetadataEntity = typeof authMetadata.$inferSelect;
export type NewAuthMetadataEntity = typeof authMetadata.$inferInsert;
