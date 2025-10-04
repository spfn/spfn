/**
 * Test Fixture Entity - Users
 *
 * 프레임워크 기능 테스트를 위한 전용 엔티티
 * 개발용 엔티티(src/server/entities/users.ts)와 독립적
 */
import { pgTable, bigserial, text, timestamp } from 'drizzle-orm/pg-core';

export const testUsers = pgTable('test_users', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    email: text('email').unique(),
    name: text('name'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
        .defaultNow()
        .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
        .defaultNow(),
});

export type TestUser = typeof testUsers.$inferSelect;
export type InsertTestUser = typeof testUsers.$inferInsert;