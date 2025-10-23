/**
 * CMS Draft Cache Entity
 *
 * 관리자별 Draft 콘텐츠를 캐싱합니다.
 * - 사용자별 격리 (userId)
 * - 실시간 미리보기 지원
 * - 동시 편집 가능
 *
 * 핵심 기능:
 * - 여러 관리자가 같은 섹션을 동시에 편집
 * - 각자의 변경사항은 자신의 미리보기에만 표시
 * - 충돌 없이 안전하게 작업
 */

import { pgTable, serial, text, jsonb, timestamp, index, unique } from 'drizzle-orm/pg-core';

export const cmsDraftCache = pgTable('cms_draft_cache', {
    // Primary Key
    id: serial('id').primaryKey(),

    // 섹션 (페이지 단위)
    section: text('section').notNull(),
    // "home" | "why-futureplay" | "team" | "our-companies" | "apply"

    // 언어
    locale: text('locale').notNull(),
    // "ko" | "en" | "ja"

    // 사용자 ID (핵심 필드!)
    userId: text('user_id').notNull(),
    // 각 관리자의 독립적인 작업 공간

    // Draft 콘텐츠 (JSONB)
    content: jsonb('content').notNull(),
    // Record<string, LabelValue>
    // {
    //   "home.hero.title": { type: "text", content: "수정 중..." },
    //   "home.hero.subtitle": { type: "text", content: "새로운 문구" },
    //   ...
    // }

    // 최종 수정 시각
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    // UNIQUE 제약: section + locale + userId 조합은 유일
    unique('cms_draft_cache_unique')
    .on(table.section, table.locale, table.userId),

    // 인덱스: section으로 조회 최적화
    index('cms_draft_cache_section_idx').on(table.section),

    // 인덱스: userId로 사용자의 모든 draft 조회 최적화
    index('cms_draft_cache_user_idx').on(table.userId),
]);

// 타입 추론
export type CmsDraftCache = typeof cmsDraftCache.$inferSelect;
export type NewCmsDraftCache = typeof cmsDraftCache.$inferInsert;

/**
 * 사용 예시:
 *
 * // Draft 초기화 (편집 시작)
 * await db.insert(cmsDraftCache)
 *   .values({
 *     section: 'home',
 *     locale: 'ko',
 *     userId: 'user-a@futureplay.com',
 *     content: publishedContent  // 발행 버전 복사
 *   });
 *
 * // Draft 업데이트 (값 수정 시)
 * const cache = await db.select()
 *   .from(cmsDraftCache)
 *   .where(and(
 *     eq(cmsDraftCache.section, 'home'),
 *     eq(cmsDraftCache.locale, 'ko'),
 *     eq(cmsDraftCache.userId, userId)
 *   ))
 *   .limit(1);
 *
 * const updatedContent = {
 *   ...cache[0].content,
 *   'home.hero.title': newValue  // 부분 업데이트
 * };
 *
 * await db.update(cmsDraftCache)
 *   .set({ content: updatedContent, updatedAt: new Date() })
 *   .where(eq(cmsDraftCache.id, cache[0].id));
 *
 * // Draft 조회 (미리보기)
 * const draft = await db.select()
 *   .from(cmsDraftCache)
 *   .where(and(
 *     eq(cmsDraftCache.section, 'home'),
 *     eq(cmsDraftCache.locale, 'ko'),
 *     eq(cmsDraftCache.userId, session.user.id)
 *   ))
 *   .limit(1);
 *
 * // 사용자의 모든 작업 중인 섹션 조회
 * const userDrafts = await db.select()
 *   .from(cmsDraftCache)
 *   .where(eq(cmsDraftCache.userId, userId))
 *   .orderBy(desc(cmsDraftCache.updatedAt));
 *
 * // 오래된 Draft 정리 (30일 이상)
 * const stale = await db.delete(cmsDraftCache)
 *   .where(lt(
 *     cmsDraftCache.updatedAt,
 *     new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
 *   ))
 *   .returning();
 *
 * // Draft 폐기 (변경사항 버리기)
 * await db.delete(cmsDraftCache)
 *   .where(and(
 *     eq(cmsDraftCache.section, 'home'),
 *     eq(cmsDraftCache.locale, 'ko'),
 *     eq(cmsDraftCache.userId, userId)
 *   ));
 */