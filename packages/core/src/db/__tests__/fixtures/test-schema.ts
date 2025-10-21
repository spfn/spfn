/**
 * Test Schema for DB Integration Tests
 */

import { pgTable, serial, text, timestamp, integer } from 'drizzle-orm/pg-core';

/**
 * Test users table
 */
export const testUsers = pgTable('test_users', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Test posts table
 */
export const testPosts = pgTable('test_posts', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => testUsers.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    content: text('content'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Test schema export
 */
export const testSchema = {
    testUsers,
    testPosts,
};