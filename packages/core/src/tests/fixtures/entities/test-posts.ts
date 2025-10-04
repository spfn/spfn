/**
 * Test Fixture Entity - Posts
 *
 * 프레임워크 기능 테스트를 위한 전용 엔티티
 * 개발용 엔티티(src/server/entities/posts.ts)와 독립적
 */
import { pgTable, bigserial, text, timestamp } from 'drizzle-orm/pg-core';
import { testUsers } from './test-users';

export const testPosts = pgTable('test_posts', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    title: text('title').notNull(),
    content: text('content'),
    authorId: bigserial('author_id', { mode: 'number' })
        .notNull()
        .references(() => testUsers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
        .defaultNow()
        .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
        .defaultNow(),
});

export type TestPost = typeof testPosts.$inferSelect;
export type InsertTestPost = typeof testPosts.$inferInsert;