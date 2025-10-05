import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core';

/**
 * Example User Entity
 *
 * This is a sample Drizzle ORM table definition.
 * Modify or delete this file based on your needs.
 *
 * Using @spfn/core helpers:
 * - id() - Auto-incrementing primary key (bigserial)
 * - timestamps() - createdAt & updatedAt fields
 */

export const users = pgTable('users',
{
    id: id(),
    email: text('email').notNull().unique(),
    name: text('name'),
    ...timestamps(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;