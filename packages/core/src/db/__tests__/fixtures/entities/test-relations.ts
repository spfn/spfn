/**
 * Test Fixture Relations
 *
 * Drizzle ORM relations for test entities
 * Required for db.query API to support relation loading
 */

import { relations } from 'drizzle-orm';
import { testUsers } from './test-users';
import { testPosts } from './test-posts';

/**
 * User Relations
 *
 * One user has many posts
 */
export const testUsersRelations = relations(testUsers, ({ many }) => ({
    posts: many(testPosts),
}));

/**
 * Post Relations
 *
 * Each post belongs to one user (author)
 */
export const testPostsRelations = relations(testPosts, ({ one }) => ({
    author: one(testUsers, {
        fields: [testPosts.authorId],
        references: [testUsers.id],
    }),
}));