/**
 * CMS Zustand Store
 *
 * 클라이언트 컴포넌트에서 CMS 사용을 위한 상태 관리
 * - 서버에서 초기화된 데이터를 클라이언트로 전달
 * - 클라이언트에서 비동기로 로드 가능
 */

'use client';

import { create } from 'zustand';
import { cmsApi } from '@/api';
import type { SectionData } from '@/server';

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
            const response = await cmsApi.cmsPublishedCache.get({
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