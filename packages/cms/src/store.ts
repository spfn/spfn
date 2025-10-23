/**
 * CMS Zustand Store
 *
 * 클라이언트 컴포넌트에서 CMS 사용을 위한 상태 관리
 * - 서버에서 초기화된 데이터를 클라이언트로 전달
 * - 클라이언트에서 비동기로 로드 가능
 * - 서버 API와 동일한 패턴 ({ t } 사용)
 */

'use client';

import React from 'react';
import { create } from 'zustand';
import { cmsApi } from './client';
import type { SectionData } from './server';

/**
 * 변수 치환 헬퍼 (서버와 동일)
 */
function replaceVariables(text: string, replace: Record<string, string | number>): string
{
    return text.replace(/\{(\w+)}/g, (match, key) =>
    {
        const value = replace[key];
        return value !== undefined ? String(value) : match;
    });
}

interface CmsState
{
    /**
     * 섹션별 데이터
     * { 'home': { section: 'home', content: {...}, version: 1, ... }, ... }
     */
    sections: Record<string, SectionData>;

    /**
     * 로딩 상태
     */
    loading: Record<string, boolean>;

    /**
     * 섹션 데이터 설정 (서버에서 초기화용)
     */
    setSection: (section: string, data: SectionData) => void;

    /**
     * 여러 섹션 한번에 설정
     */
    setSections: (sections: Record<string, SectionData>) => void;

    /**
     * 섹션 비동기 로드
     */
    loadSection: (section: string, locale?: string) => Promise<void>;

    /**
     * 라벨 업데이트 (Draft Mode용)
     */
    updateLabel: (section: string, key: string, value: any) => void;

    /**
     * 초기화
     */
    reset: () => void;
}

export const useCmsStore = create<CmsState>((set, get) => ({
    sections: {},
    loading: {},

    setSection: (section, data) =>
    {
        set((state) => ({
            sections: {
                ...state.sections,
                [section]: data,
            },
        }));
    },

    setSections: (sections) =>
    {
        set((state) => ({
            sections: {
                ...state.sections,
                ...sections,
            },
        }));
    },

    loadSection: async (section, locale = 'ko') =>
    {
        const state = get();

        // 이미 로드 중이면 스킵
        if (state.loading[section])
        {
            return;
        }

        // 이미 로드되어 있으면 스킵
        if (state.sections[section])
        {
            return;
        }

        set((state) => ({
            loading: { ...state.loading, [section]: true },
        }));

        try
        {
            const response = await cmsApi.publishedCache.get({
                query: { sections: section, locale },
            });

            // Check for error response
            if ('error' in response)
            {
                console.error(`Failed to load section ${section}:`, response.error);
                return;
            }

            // Response is array, get first element
            const data = response[0];

            if (!data)
            {
                console.warn(`Section ${section} not found`);
                return;
            }

            const sectionData: SectionData = {
                section: data.section,
                locale: data.locale,
                content: (data.content as Record<string, any>) || {},
                version: data.version || 0,
                publishedAt: data.publishedAt || null,
            };

            set((state) => ({
                sections: {
                    ...state.sections,
                    [section]: sectionData,
                },
                loading: { ...state.loading, [section]: false },
            }));
        }
        catch (error)
        {
            console.error(`Error loading CMS section ${section}:`, error);
            set((state) => ({
                loading: { ...state.loading, [section]: false },
            }));
        }
    },

    updateLabel: (section, key, value) =>
    {
        set((state) => ({
            sections: {
                ...state.sections,
                [section]: {
                    ...state.sections[section],
                    content: {
                        ...state.sections[section]?.content,
                        [`${section}.${key}`]: value,
                    },
                },
            },
        }));
    },

    reset: () =>
    {
        set({
            sections: {},
            loading: {},
        });
    },
}));

/**
 * 섹션 Hook (서버 API와 동일한 패턴)
 *
 * @param section - 섹션 이름
 * @param options - 옵션 (autoLoad: 자동 로드 여부)
 * @returns { t, data, loading }
 *
 * @example
 * ```tsx
 * 'use client';
 * import { useSection } from '@/lib/cms';
 *
 * export function ClientComponent()
 * {
 *     const { t } = useSection('home');
 *     return <h1>{t('hero.title')}</h1>;
 * }
 * ```
 */
export function useSection(
    section: string,
    options: { autoLoad?: boolean; locale?: string } = {}
)
{
    const { autoLoad = false, locale = 'ko' } = options;

    const sectionData = useCmsStore((state) => state.sections[section]);
    const loading = useCmsStore((state) => state.loading[section] ?? false);
    const loadSection = useCmsStore((state) => state.loadSection);

    // 자동 로드 옵션이 켜져있고 데이터가 없으면 로드
    React.useEffect(() =>
    {
        if (autoLoad && !sectionData && !loading)
        {
            loadSection(section, locale);
        }
    }, [autoLoad, section, locale, sectionData, loading, loadSection]);

    // Translation function (서버와 동일)
    const t = React.useCallback(
        (key: string, defaultValue?: any, replace?: Record<string, string | number>) =>
        {
            if (!sectionData)
            {
                return defaultValue;
            }

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
        },
        [section, sectionData]
    );

    return {
        t,
        data: sectionData,
        loading,
    };
}

/**
 * 여러 섹션 Hook
 *
 * @param sectionNames - 섹션 이름 배열
 * @returns { [section]: { t, data, loading }, ... }
 *
 * @example
 * ```tsx
 * const sections = useSections(['home', 'why-futureplay']);
 * sections.home.t('hero.title');
 * ```
 */
export function useSections(sectionNames: string[])
{
    const allSections = useCmsStore((state) => state.sections);
    const allLoading = useCmsStore((state) => state.loading);

    const result: Record<string, ReturnType<typeof useSection>> = {};

    sectionNames.forEach((section) =>
    {
        const sectionData = allSections[section];
        const loading = allLoading[section] ?? false;

        const t = (key: string, defaultValue?: any, replace?: Record<string, string | number>) =>
        {
            if (!sectionData)
            {
                return defaultValue;
            }

            const fullKey = `${section}.${key}`;
            let value = sectionData.content[fullKey];

            if (value === undefined)
            {
                value = defaultValue;
            }

            if (typeof value === 'string' && replace)
            {
                value = replaceVariables(value, replace);
            }

            return value;
        };

        result[section] = {
            t,
            data: sectionData,
            loading,
        };
    });

    return result;
}