/**
 * useSections Hook
 *
 * 여러 섹션을 한번에 사용
 */

'use client';

import { useCmsStore } from '../store/cms.store';
import type { useSection } from './useSection';

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
 * 여러 섹션 Hook
 *
 * @param sectionNames - 섹션 이름 배열
 * @returns { [section]: { t, data, loading }, ... }
 *
 * @example
 * ```tsx
 * 'use client';
 * import { useSections } from '@spfn/cms/client';
 *
 * export function Component()
 * {
 *     const sections = useSections(['home', 'layout']);
 *     return (
 *         <div>
 *             <h1>{sections.home.t('hero.title')}</h1>
 *             <p>{sections.layout.t('footer.copyright')}</p>
 *         </div>
 *     );
 * }
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