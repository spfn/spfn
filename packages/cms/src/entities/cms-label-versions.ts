/**
 * CMS Label Versions Entity
 *
 * 라벨의 버전 메타데이터를 관리합니다.
 * - 버전별 상태 (draft/published/archived)
 * - 발행 정보 (publishedAt, publishedBy)
 * - 버전 노트
 */

import { pgTable, serial, integer, text, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { cmsLabels } from './cms-labels';

export const cmsLabelVersions = pgTable('cms_label_versions', {
    // Primary Key
    id: serial('id').primaryKey(),

    // Foreign Key: cms_labels
    labelId: integer('label_id')
    .notNull()
    .references(() => cmsLabels.id, { onDelete: 'cascade' }),

    // 버전 번호
    version: integer('version').notNull(),

    // 버전 상태
    status: text('status').notNull(),
    // "draft" | "published" | "archived"

    // 발행 정보
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: text('published_by'),

    // 버전 노트 (변경사항 설명)
    notes: text('notes'),

    // 버전 생성자
    createdBy: text('created_by'),

    // 생성 시각
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    // UNIQUE 제약: 각 라벨의 버전 번호는 고유
    unique('cms_label_versions_label_version_unique')
    .on(table.labelId, table.version),

    // 인덱스: labelId로 버전 목록 조회 최적화
    index('cms_label_versions_label_id_idx').on(table.labelId),

    // 인덱스: status 필터링 최적화
    index('cms_label_versions_status_idx').on(table.status),
]);

// 타입 추론
export type CmsLabelVersion = typeof cmsLabelVersions.$inferSelect;
export type NewCmsLabelVersion = typeof cmsLabelVersions.$inferInsert;

/**
 * 사용 예시:
 *
 * // 새 버전 생성 (draft)
 * await db.insert(cmsLabelVersions).values({
 *   labelId: 1,
 *   version: 2,
 *   status: 'draft',
 *   notes: '문구 개선',
 *   createdBy: 'editor@futureplay.com'
 * });
 *
 * // 버전 발행
 * await db.update(cmsLabelVersions)
 *   .set({
 *     status: 'published',
 *     publishedAt: new Date(),
 *     publishedBy: 'admin@futureplay.com'
 *   })
 *   .where(and(
 *     eq(cmsLabelVersions.labelId, 1),
 *     eq(cmsLabelVersions.version, 2)
 *   ));
 *
 * // 라벨의 모든 버전 조회
 * const versions = await db.select()
 *   .from(cmsLabelVersions)
 *   .where(eq(cmsLabelVersions.labelId, 1))
 *   .orderBy(desc(cmsLabelVersions.version));
 *
 * // 발행된 버전만 조회
 * const published = await db.select()
 *   .from(cmsLabelVersions)
 *   .where(eq(cmsLabelVersions.status, 'published'))
 *   .orderBy(desc(cmsLabelVersions.publishedAt));
 */