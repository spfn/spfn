/**
 * useSection Hook
 *
 * 클라이언트 컴포넌트에서 섹션 데이터 사용
 */

'use client';

import React from 'react';
import { useCmsStore } from '../store/cms.store';

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
 * import { useSection } from '@spfn/cms/client';
 *
 * export function ClientComponent()
 * {
 *     const { t } = useSection('home', { autoLoad: true });
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