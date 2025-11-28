/**
 * CMS Section Loader - Common Logic
 *
 * 서버/클라이언트 공통 로직
 * React cache는 여기서 사용하지 않음 (server.ts에서 래핑)
 */

import { logger } from '@spfn/core/logger';
import { api } from "@spfn/cms/lib";
import type { SectionAPI, SectionData, TranslationFunction } from "@spfn/cms/lib";

const localeLogger = logger.child('@spfn/cms:locale-api');

/**
 * Fetch options type (extends RequestInit for Next.js compatibility)
 */
export type FetchOptions = RequestInit & {
    next?: {
        revalidate?: number | false;
        tags?: string[];
    };
};

/**
 * 변수 치환 헬퍼
 *
 * @param text - 치환할 텍스트 (예: 'Hello {name}!')
 * @param replace - 치환 맵 (예: { name: 'World' })
 * @returns 치환된 텍스트 (예: 'Hello World!')
 */
export function replaceVariables(text: string, replace: Record<string, string | number>): string
{
    return text.replace(/\{(\w+)}/g, (match, key) =>
    {
        const value = replace[key];
        return value !== undefined ? String(value) : match;
    });
}

/**
 * Translation 함수 생성 헬퍼
 */
function createTranslationFn(section: string, content: Record<string, any>): TranslationFunction
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
}

/**
 * 빈 섹션 데이터 생성 헬퍼
 */
function createEmptySection(section: string, locale: string): SectionAPI
{
    const sectionData: SectionData = {
        section,
        locale,
        content: {},
        version: 0,
        publishedAt: null,
    };

    const t: TranslationFunction = (_key, defaultValue) => defaultValue ?? '';
    return { t, data: sectionData };
}

/**
 * 섹션 데이터 로드 (공용 로직)
 *
 * @param section - 섹션 이름 (예: 'home', 'why-futureplay')
 * @param locale - 언어 코드
 * @param fetchOptions - fetch 옵션 (Next.js revalidate 등)
 * @returns Section API ({ t, data })
 */
export async function getSection(
    section: string,
    locale: string,
    fetchOptions?: FetchOptions
): Promise<SectionAPI>
{
    try
    {
        const response = await api.getPublishedCache
            .fetchOptions(fetchOptions ? fetchOptions : { next: { revalidate: 60 }})
            .call({ locale, sections: section });

        const data = response[0];

        // Success response
        const sectionData: SectionData = {
            section: data.section,
            locale: data.locale,
            content: data.content || {},
            version: data.version,
            publishedAt: data.publishedAt,
        };

        // Translation function
        const t = createTranslationFn(section, sectionData.content);
        return {
            t,
            data: sectionData,
        };
    }
    catch (error)
    {
        const err = error instanceof Error ? error : new Error(String(error));
        localeLogger.error(`Failed to fetch section "${section}"`, err);
        return createEmptySection(section, locale);
    }
}

/**
 * 여러 섹션 한번에 로드 (공용 로직)
 * 단일 API 호출로 여러 섹션을 효율적으로 가져옵니다
 *
 * @param sections - 섹션 이름 배열
 * @param locale - 언어 코드
 * @param fetchOptions - fetch 옵션 (Next.js revalidate 등)
 * @returns Section API 맵 ({ home: { t, data }, ... })
 */
export async function getSections(
    sections: string[],
    locale: string,
    fetchOptions?: FetchOptions
): Promise<Record<string, SectionAPI>>
{
    try
    {
        const response = await api.getPublishedCache
            .fetchOptions(fetchOptions ? fetchOptions : { next: { revalidate: 60 }})
            .call({ locale, sections });

        // Build sections map from response
        const sectionsMap: Record<string, SectionAPI> = {};

        // First, create empty entries for all requested sections
        sections.forEach(section =>
        {
            sectionsMap[section] = createEmptySection(section, locale);
        });

        // Then, fill in data for found sections
        response.forEach((sectionData: SectionData) =>
        {
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
        const err = error instanceof Error ? error : new Error(String(error));
        localeLogger.error('Failed to fetch sections', err);

        // Return empty sections on error
        const sectionsMap: Record<string, SectionAPI> = {};
        sections.forEach(section =>
        {
            sectionsMap[section] = createEmptySection(section, locale);
        });

        return sectionsMap;
    }
}