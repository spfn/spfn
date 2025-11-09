/**
 * @spfn/cms/server
 *
 * Server-side Only Module
 * 서버 전용 모듈 (서버 컴포넌트 + 백엔드)
 *
 * Includes:
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

import { cache } from 'react';
import { client } from '@spfn/core/client';
import { getPublishedCacheContract } from '@/lib/contracts/published-cache';
import { getLocale } from '@/server/helpers/locale.actions';

/**
 * Section Data Type
 */
export type SectionData = {
    section: string;
    locale: string;
    content: Record<string, any>;
    version: number;
    publishedAt: string | null;
};

/**
 * Translation Function Type (runtime version)
 */
type ServerTranslationFunction = (
    key: string,
    defaultValue?: any,
    replace?: Record<string, string | number>
) => any;

/**
 * Section API Return Type
 */
export type SectionAPI = {
    /**
     * 라벨 값 가져오기 (변수 치환 지원)
     *
     * @param key - 라벨 키 (섹션 제외, 예: 'hero.title')
     * @param defaultValue - 기본값
     * @param replace - 변수 치환 맵 (예: { name: 'John' })
     * @returns 라벨 값 (문자열인 경우 변수 치환됨)
     */
    t: ServerTranslationFunction;

    /**
     * 섹션 데이터
     */
    data: SectionData;
};

/**
 * 변수 치환 헬퍼
 *
 * @param text - 치환할 텍스트 (예: 'Hello {name}!')
 * @param replace - 치환 맵 (예: { name: 'World' })
 * @returns 치환된 텍스트 (예: 'Hello World!')
 */
function replaceVariables(text: string, replace: Record<string, string | number>): string
{
    return text.replace(/\{(\w+)}/g, (match, key) =>
    {
        const value = replace[key];
        return value !== undefined ? String(value) : match;
    });
}

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

    try
    {
        // Call SPFN API via contract (uses singleton client)
        const response = await client.call(
            getPublishedCacheContract,
            {
                query: { sections: section, locale: actualLocale },
                fetchOptions: { next: { revalidate: 60 } } // 60초마다 자동 갱신
            }
        );

        // Check if response has error
        if ('error' in response)
        {
            console.warn(`[CMS] ${response.error}`);
            // Return empty section data
            const sectionData: SectionData = {
                section,
                locale: actualLocale,
                content: {} as Record<string, any>,
                version: 0,
                publishedAt: null,
            };

            const t: ServerTranslationFunction = (_key, defaultValue) => defaultValue ?? '';
            return { t, data: sectionData };
        }

        // Response is an array, get first element
        const found = response[0];

        if (!found)
        {
            // Section not found, return empty
            const sectionData: SectionData = {
                section,
                locale: actualLocale,
                content: {} as Record<string, any>,
                version: 0,
                publishedAt: null,
            };

            const t: ServerTranslationFunction = (_key, defaultValue) => defaultValue ?? '';
            return { t, data: sectionData };
        }

        // Success response
        const sectionData: SectionData = {
            section: found.section,
            locale: found.locale,
            content: found.content || {},
            version: found.version,
            publishedAt: found.publishedAt,
        };

        // Translation function
        const t: ServerTranslationFunction = (key, defaultValue, replace) =>
        {
            const fullKey = `${section}.${key}`;
            let value = sectionData.content[fullKey];

            if (value === undefined || value === null)
            {
                value = defaultValue ?? '';
            }

            // text 타입 객체이면 content 필드 추출
            if (typeof value === 'object' && value !== null && value.type === 'text' && 'content' in value)
            {
                value = value.content;
            }

            // 문자열인 경우 변수 치환 처리
            if (typeof value === 'string')
            {
                if (replace)
                {
                    value = replaceVariables(value, replace);
                }
                return value;
            }

            // 문자열이 아니면 원본 값 반환 (객체 타입: image, video, file, object 등)
            return value;
        };

        return {
            t,
            data: sectionData,
        };
    }
    catch (error)
    {
        console.error(`[CMS] Failed to fetch section "${section}":`, error);

        // Return empty section data on error
        const sectionData: SectionData = {
            section,
            locale: actualLocale,
            content: {} as Record<string, any>,
            version: 0,
            publishedAt: null,
        };

        const t: ServerTranslationFunction = (_key, defaultValue) => defaultValue ?? '';
        return { t, data: sectionData };
    }
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

    try
    {
        // Call SPFN API with array of sections (single HTTP request)
        const response = await client.call(
            getPublishedCacheContract,
            {
                query: { sections, locale: actualLocale },
                fetchOptions: { next: { revalidate: 60 } } // 60초마다 자동 갱신
            }
        );

        // Check if response has error
        if ('error' in response)
        {
            console.warn(`[CMS] ${response.error}`);
            // Return empty sections
            const sectionsMap: Record<string, SectionAPI> = {};
            sections.forEach(section =>
            {
                sectionsMap[section] = {
                    t: (_key, defaultValue) => defaultValue ?? '',
                    data: {
                        section,
                        locale: actualLocale,
                        content: {},
                        version: 0,
                        publishedAt: null,
                    }
                };
            });
            return sectionsMap;
        }

        // Build sections map from response
        const sectionsMap: Record<string, SectionAPI> = {};

        // First, create empty entries for all requested sections
        sections.forEach(section =>
        {
            sectionsMap[section] = {
                t: (_key, defaultValue) => defaultValue ?? '',
                data: {
                    section,
                    locale: actualLocale,
                    content: {},
                    version: 0,
                    publishedAt: null,
                }
            };
        });

        // Then, fill in data for found sections
        response.forEach(sectionData =>
        {
            const createTranslationFn = (section: string, content: Record<string, any>): ServerTranslationFunction =>
            {
                return (key, defaultValue, replace) =>
                {
                    const fullKey = `${section}.${key}`;
                    let value = content[fullKey];

                    if (value === undefined || value === null)
                    {
                        value = defaultValue ?? '';
                    }

                    // text 타입 객체이면 content 필드 추출
                    if (typeof value === 'object' && value !== null && value.type === 'text' && 'content' in value)
                    {
                        value = value.content;
                    }

                    // 문자열인 경우 변수 치환 처리
                    if (typeof value === 'string')
                    {
                        if (replace)
                        {
                            value = replaceVariables(value, replace);
                        }
                        return value;
                    }

                    // 문자열이 아니면 원본 값 반환 (객체 타입: image, video, file, object 등)
                    return value;
                };
            };

            sectionsMap[sectionData.section] = {
                t: createTranslationFn(sectionData.section, sectionData.content),
                data: {
                    section: sectionData.section,
                    locale: sectionData.locale,
                    content: sectionData.content,
                    version: sectionData.version,
                    publishedAt: sectionData.publishedAt,
                }
            };
        });

        return sectionsMap;
    }
    catch (error)
    {
        console.error(`[CMS] Failed to fetch sections:`, error);

        // Return empty sections on error
        const sectionsMap: Record<string, SectionAPI> = {};
        sections.forEach(section =>
        {
            sectionsMap[section] = {
                t: (_key, defaultValue) => defaultValue ?? '',
                data: {
                    section,
                    locale: actualLocale,
                    content: {},
                    version: 0,
                    publishedAt: null,
                }
            };
        });
        return sectionsMap;
    }
});

// ============================================================================
// Locale Management (Constants Only)
// ============================================================================
// Note: Server Actions (getLocale, setLocale, etc.) are exported from actions.ts
// to avoid bundling "use server" directives into server.ts

export {
    LOCALE_COOKIE_KEY,
    getLocaleInfo,
    getSupportedLocales,
    getFlag,
    getDialCode,
    isRTL,
    LOCALE_INFO_MAP,
    type LocaleInfo,
    type SupportedLocale,
} from './lib/constants/locale.constants';

// ============================================================================
// Backend: Sync Utilities (server startup, CLI scripts)
// ============================================================================

export { syncSection, syncAll, initLabelSync, loadLabelsFromJson } from './server/helpers/sync';

// ============================================================================
// Backend: Repositories (DB access)
// ============================================================================

export * from './server/repositories/index';

// ============================================================================
// Backend: Entities (DB schemas)
// ============================================================================

export * from './server/entities/index';

// ============================================================================
// Backend: Label Helpers (for processing JSON labels)
// ============================================================================

export * from './server/labels/index';

// ============================================================================
// Backend: Codegen Generators (for development)
// ============================================================================

export { createLabelSyncGenerator } from './server/generators/label-sync-generator';