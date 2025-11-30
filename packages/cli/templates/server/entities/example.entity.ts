import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';

export const examples = pgTable('examples', {
    id: id(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    ...timestamps(),
});

export type Example = typeof examples.$inferSelect;
export type NewExample = typeof examples.$inferInsert;