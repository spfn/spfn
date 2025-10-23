/**
 * CMS Audit Logs Entity
 *
 * CMS의 모든 변경사항을 추적합니다.
 * - 누가 (userId, userName)
 * - 언제 (createdAt)
 * - 무엇을 (action, changes)
 * - 왜 (metadata)
 */

import { pgTable, serial, integer, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { cmsLabels } from './cms-labels';

export const cmsAuditLogs = pgTable('cms_audit_logs', {
    // Primary Key
    id: serial('id').primaryKey(),

    // Foreign Key: cms_labels (nullable - 라벨 삭제 시 로그는 유지)
    labelId: integer('label_id')
    .references(() => cmsLabels.id, { onDelete: 'set null' }),

    // 작업 유형
    action: text('action').notNull(),
    // "create" | "update" | "publish" | "unpublish" | "archive" | "delete" | "rollback" | "duplicate"

    // 사용자 정보
    userId: text('user_id').notNull(),
    userName: text('user_name'),

    // 변경 내용 (before/after)
    changes: jsonb('changes'),
    // { before: {...}, after: {...} }

    // 추가 메타데이터
    metadata: jsonb('metadata'),
    // { version: number, ip: string, userAgent: string, ... }

    // 작업 시각
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    // 인덱스: labelId로 이력 조회 최적화
    index('cms_audit_logs_label_id_idx').on(table.labelId),

    // 인덱스: userId로 사용자 활동 조회 최적화
    index('cms_audit_logs_user_id_idx').on(table.userId),

    // 인덱스: action 필터링 최적화
    index('cms_audit_logs_action_idx').on(table.action),

    // 인덱스: 시간순 조회 최적화
    index('cms_audit_logs_created_at_idx').on(table.createdAt),
]);

// 타입 추론
export type CmsAuditLog = typeof cmsAuditLogs.$inferSelect;
export type NewCmsAuditLog = typeof cmsAuditLogs.$inferInsert;

/**
 * 사용 예시:
 *
 * // 라벨 생성 로그
 * await db.insert(cmsAuditLogs).values({
 *   labelId: 1,
 *   action: 'create',
 *   userId: 'user123',
 *   userName: '김철수',
 *   changes: {
 *     before: null,
 *     after: {
 *       key: 'home.hero.title',
 *       section: 'home',
 *       type: 'text'
 *     }
 *   },
 *   metadata: {
 *     ip: '192.168.1.1',
 *     userAgent: 'Mozilla/5.0...'
 *   }
 * });
 *
 * // 발행 로그
 * await db.insert(cmsAuditLogs).values({
 *   labelId: 1,
 *   action: 'publish',
 *   userId: 'admin123',
 *   userName: '관리자',
 *   changes: {
 *     before: { status: 'draft', publishedVersion: null },
 *     after: { status: 'published', publishedVersion: 2 }
 *   },
 *   metadata: {
 *     version: 2,
 *     notes: '신규 브랜딩 적용'
 *   }
 * });
 *
 * // 라벨별 이력 조회
 * const logs = await db.select()
 *   .from(cmsAuditLogs)
 *   .where(eq(cmsAuditLogs.labelId, 1))
 *   .orderBy(desc(cmsAuditLogs.createdAt))
 *   .limit(20);
 *
 * // 사용자별 활동 조회
 * const userActivity = await db.select()
 *   .from(cmsAuditLogs)
 *   .where(eq(cmsAuditLogs.userId, 'user123'))
 *   .orderBy(desc(cmsAuditLogs.createdAt));
 *
 * // 최근 24시간 변경 이력
 * const recent = await db.select()
 *   .from(cmsAuditLogs)
 *   .where(gte(cmsAuditLogs.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)))
 *   .orderBy(desc(cmsAuditLogs.createdAt));
 */