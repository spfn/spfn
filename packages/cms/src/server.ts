/**
 * @spfn/cms/server
 *
 * Includes:
 * - Configuration API
 * - Server Components (getSection, getSections)
 * - Locale Management (Server Actions)
 * - Backend: Sync utilities
 * - Backend: Repositories
 * - Backend: Entities
 * - Backend: Label helpers
 * - Backend: Codegen generators
 *
 * @note This module should only be imported in server-side code
 */

import { getLocale } from "@/actions";
import { loadSection, loadSections } from "@/lib/core/locale.api";
import { cache } from 'react';
import type { SectionAPI } from '@/lib/types/section';

// ============================================================================
// Configuration API (Server-only)
// ============================================================================

export { getCmsConfig, configureCms, resetCmsConfig } from './server/config/cms.config';
export type { CmsConfig } from './lib/types/config';
export { initLabelSync } from './server/services/sync.service';

// ============================================================================
// Section API
// ============================================================================

// Re-export types for backward compatibility
export type { SectionData, SectionAPI } from '@/lib/types/section';

/**
 * 섹션 데이터 로드 (React cache 적용)
 *
 * 동일한 요청 내에서 같은 섹션을 여러 번 요청해도 한 번만 API 호출
 *
 * @param section - 섹션 이름 (예: 'home', 'why-futureplay')
 * @param locale - 언어 코드 (선택, 미지정시 쿠키에서 자동 조회)
 * @returns Section API ({ t, data })
 *
 * @example
 * ```tsx
 * // Server Component
 * import { getSection } from '@spfn/cms/server';
 *
 * export default async function HomePage()
 * {
 *     // locale을 지정하지 않으면 쿠키에서 자동으로 가져옴
 *     const { t } = await getSection('home');
 *
 *     // 또는 명시적으로 locale 지정
 *     const { t: tEn } = await getSection('home', 'en');
 *
 *     return (
 *         <div>
 *             <h1>{t('hero.title')}</h1>
 *             <p>{t('hero.subtitle', 'Default Subtitle')}</p>
 *             <p>{t('hero.greeting', 'Hello {name}!', { name: 'World' })}</p>
 *         </div>
 *     );
 * }
 * ```
 */
export const getSection = cache(async (
    section: string,
    locale?: string
): Promise<SectionAPI> =>
{
    // locale이 지정되지 않으면 쿠키에서 가져옴
    const actualLocale: string = locale ?? await getLocale();

    // Use common loader with React cache
    return loadSection(section, actualLocale, { next: { revalidate: 60 } });
});

/**
 * 여러 섹션 한번에 로드 (React cache 적용)
 * 단일 API 호출로 여러 섹션을 효율적으로 가져옵니다
 *
 * @param sections - 섹션 이름 배열
 * @param locale - 언어 코드 (선택, 미지정시 쿠키에서 자동 조회)
 * @returns Section API 맵 ({ home: { t, data }, ... })
 *
 * @example
 * ```tsx
 * // Server Component
 * import { getSections } from '@spfn/cms/server';
 *
 * export default async function Page()
 * {
 *     // locale을 지정하지 않으면 쿠키에서 자동으로 가져옴
 *     const sections = await getSections(['home', 'why-futureplay']);
 *
 *     // 또는 명시적으로 locale 지정
 *     const sectionsEn = await getSections(['home', 'why-futureplay'], 'en');
 *
 *     return (
 *         <div>
 *             <h1>{sections.home.t('hero.title')}</h1>
 *             <p>{sections['why-futureplay'].t('intro.text')}</p>
 *         </div>
 *     );
 * }
 * ```
 */
export const getSections = cache(async (
    sections: string[],
    locale?: string
): Promise<Record<string, SectionAPI>> =>
{
    // locale이 지정되지 않으면 쿠키에서 가져옴
    const actualLocale: string = locale ?? await getLocale();

    // Use common loader with React cache
    return loadSections(sections, actualLocale, { next: { revalidate: 60 } });
});