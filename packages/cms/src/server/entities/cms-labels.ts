/**
 * CMS Labels Entity
 *
 * 라벨의 메타데이터와 현재 발행 상태를 관리합니다.
 * - 라벨 식별 (id, key)
 * - 섹션 분류 (section)
 * - 타입 정의 (type)
 * - 발행 상태 (publishedVersion)
 */

import { index, integer, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { createFunctionSchema } from '@spfn/core/db';

// Create isolated schema for @spfn/cms
const schema = createFunctionSchema('@spfn/cms');

export const cmsLabels = schema.table('labels', {
    // Primary Key
    id: serial('id').primaryKey(),

    // 라벨 식별자
    key: text('key').notNull().unique(),
    // 예: "home.hero.title", "why-futureplay.hero.subtitle"
    // 구조: {section}.{component}.{property}

    // 섹션 분류 (페이지 단위)
    section: text('section').notNull(),
    // 예: "home", "why-futureplay", "team"

    // 값 타입
    type: text('type').notNull(),
    // "text" | "image" | "video" | "file" | "object"

    // 기본값
    defaultValue: text('default_value'),
    // 라벨의 기본값 (sync 시 설정)

    // 설명
    description: text('description'),
    // 라벨에 대한 설명 (optional)

    // 현재 발행된 버전 번호
    publishedVersion: integer('published_version'),
    // null = 미발행 상태
    // 1, 2, 3... = 발행된 버전 번호

    // 생성자 추적
    createdBy: text('created_by'),

    // 타임스탬프
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    // 인덱스: 섹션별 조회 최적화
    index('cms_labels_section_idx').on(table.section),

    // 인덱스: key로 조회 최적화 (unique 제약으로 자동 생성되지만 명시)
    index('cms_labels_key_idx').on(table.key),
]);

// 타입 추론
export type CmsLabel = typeof cmsLabels.$inferSelect;
export type NewCmsLabel = typeof cmsLabels.$inferInsert;