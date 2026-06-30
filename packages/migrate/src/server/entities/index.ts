/**
 * @spfn/migrate - Data Migrations Entity
 */

import { text } from 'drizzle-orm/pg-core';
import { utcTimestamp } from '@spfn/core/db';
import { migrateSchema } from './schema';

/**
 * Table to track applied data migrations.
 * This table should be included in the application's schema and created via drizzle generate.
 */
export const dataMigrations = migrateSchema.table('data_migrations',
    {
        /** Unique migration identifier (e.g., '20260701_backfill_users'). */
        name: text('name').primaryKey(),
        /** Timestamp when the migration was successfully applied. */
        appliedAt: utcTimestamp('applied_at').defaultNow().notNull(),
    },
);

export type DataMigrationEntity = typeof dataMigrations.$inferSelect;
export type NewDataMigrationEntity = typeof dataMigrations.$inferInsert;
