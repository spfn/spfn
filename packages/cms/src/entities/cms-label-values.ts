/**
 * CMS Label Values Entity
 *
 * 라벨의 실제 값을 저장합니다.
 * - 다국어 지원 (locale)
 * - 반응형 지원 (breakpoint)
 * - 버전 관리 (version)
 * - JSONB로 유연한 값 저장
 */

import { serial, integer, text, jsonb, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { createFunctionSchema } from '@spfn/core/db';
import { cmsLabels } from './cms-labels';

// Create isolated schema for @spfn/cms
const schema = createFunctionSchema('@spfn/cms');

export const cmsLabelValues = schema.table('label_values', {
    // Primary Key
    id: serial('id').primaryKey(),

    // Foreign Key: cms_labels
    labelId: integer('label_id')
        .notNull()
        .references(() => cmsLabels.id, { onDelete: 'cascade' }),

    // 버전 번호
    version: integer('version').notNull().default(1),

    // 언어 코드
    locale: text('locale').notNull().default('ko'),
    // "ko" | "en" | "ja"

    // 반응형 브레이크포인트
    breakpoint: text('breakpoint'),
    // null = 기본값 (모든 화면 크기)
    // "sm" | "md" | "lg" | "xl" | "2xl"

    // 실제 값 (JSONB)
    value: jsonb('value').notNull(),
    // LabelValue 타입:
    // - TextValue: { type: "text", content: string }
    // - ImageValue: { type: "image", url: string, alt?: string, width?: number, height?: number }
    // - VideoValue: { type: "video", url: string, thumbnail?: string, duration?: number }
    // - FileValue: { type: "file", url: string, filename: string, size?: number }
    // - ObjectValue: { type: "object", fields: Record<string, LabelValue> }

    // 생성 시각
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    // UNIQUE 제약: 같은 버전에서 locale + breakpoint 조합은 유일
    unique('cms_label_values_locale_breakpoint_unique')
        .on(table.labelId, table.version, table.locale, table.breakpoint),

    // 인덱스: labelId + version 복합 조회 최적화
    index('cms_label_values_label_version_idx')
        .on(table.labelId, table.version),

    // 인덱스: locale 필터링 최적화
    index('cms_label_values_locale_idx').on(table.locale),
]);

// 타입 추론
export type CmsLabelValue = typeof cmsLabelValues.$inferSelect;
export type NewCmsLabelValue = typeof cmsLabelValues.$inferInsert;

/**
 * 사용 예시:
 *
 * // 텍스트 값 저장
 * await db.insert(cmsLabelValues).values({
 *   labelId: 1,
 *   version: 1,
 *   locale: 'ko',
 *   breakpoint: null,
 *   value: {
 *     type: 'text',
 *     content: '미래를 만드는 기업'
 *   }
 * });
 *
 * // 반응형 이미지 저장 (모바일용)
 * await db.insert(cmsLabelValues).values({
 *   labelId: 2,
 *   version: 1,
 *   locale: 'ko',
 *   breakpoint: 'sm',
 *   value: {
 *     type: 'image',
 *     url: '/uploads/hero-mobile.jpg',
 *     alt: 'Hero Image',
 *     width: 640,
 *     height: 480
 *   }
 * });
 *
 * // 특정 버전의 한국어 값 조회
 * const values = await db.select()
 *   .from(cmsLabelValues)
 *   .where(and(
 *     eq(cmsLabelValues.labelId, 1),
 *     eq(cmsLabelValues.version, 2),
 *     eq(cmsLabelValues.locale, 'ko')
 *   ));
 *
 * // Object 타입 값 저장 (재귀 구조)
 * await db.insert(cmsLabelValues).values({
 *   labelId: 3,
 *   version: 1,
 *   locale: 'ko',
 *   value: {
 *     type: 'object',
 *     fields: {
 *       title: { type: 'text', content: '특징 1' },
 *       icon: { type: 'image', url: '/icons/feature1.svg', alt: 'Icon' },
 *       description: { type: 'text', content: '상세 설명...' }
 *     }
 *   }
 * });
 */