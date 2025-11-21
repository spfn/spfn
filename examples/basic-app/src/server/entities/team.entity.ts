import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';

export const teams = pgTable('teams', {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    ...timestamps(),
});

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;