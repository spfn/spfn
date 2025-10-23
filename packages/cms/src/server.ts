/**
 * CMS Server Module
 *
 * Next.js 서버 컴포넌트용 CMS 유틸리티
 * - React cache를 사용한 데이터 중복 제거
 * - 서버에서 직접 repository 호출
 * - 변수 치환 지원
 */

import { cache } from 'react';
import { cmsPublishedCacheRepository } from './repositories';

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
 * 동일한 요청 내에서 같은 섹션을 여러 번 요청해도 한 번만 DB 조회
 *
 * @param section - 섹션 이름 (예: 'home', 'why-futureplay')
 * @param locale - 언어 코드 (기본값: 'ko')
 * @returns Section API ({ t, data })
 *
 * @example
 * ```tsx
 * // Server Component
 * import { getSection } from '@/lib/cms/server';
 *
 * export default async function HomePage()
 * {
 *     const { t } = await getSection('home', 'ko');
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
    locale: string = 'ko'
): Promise<SectionAPI> =>
{
    const data = await cmsPublishedCacheRepository.findBySection(section, locale);

    const sectionData: SectionData = data
        ? {
            section: data.section,
            locale: data.locale,
            content: (data.content as Record<string, any>) || {},
            version: data.version,
            publishedAt: data.publishedAt?.toISOString() ?? null,
        }
        : {
            section,
            locale,
            content: {} as Record<string, any>,
            version: 0,
            publishedAt: null,
        };

    // Translation function
    const t: ServerTranslationFunction = (key, defaultValue, replace) =>
    {
        const fullKey = `${section}.${key}`;
        let value = sectionData.content[fullKey];

        if (value === undefined)
        {
            value = defaultValue;
        }

        // 문자열이고 치환 맵이 있으면 변수 치환
        if (typeof value === 'string' && replace)
        {
            value = replaceVariables(value, replace);
        }

        return value;
    };

    return {
        t,
        data: sectionData,
    };
});

/**
 * 여러 섹션 한번에 로드 (React cache 적용)
 *
 * @param sections - 섹션 이름 배열
 * @param locale - 언어 코드 (기본값: 'ko')
 * @returns Section API 맵 ({ home: { t, data }, ... })
 *
 * @example
 * ```tsx
 * // Server Component
 * import { getSections } from '@/lib/cms/server';
 *
 * export default async function Page()
 * {
 *     const sections = await getSections(['home', 'why-futureplay'], 'ko');
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
    locale: string = 'ko'
): Promise<Record<string, SectionAPI>> =>
{
    const promises = sections.map((section) => getSection(section, locale));
    const results = await Promise.all(promises);

    const sectionsMap: Record<string, SectionAPI> = {};
    sections.forEach((section, index) =>
    {
        sectionsMap[section] = results[index];
    });

    return sectionsMap;
});