/**
 * CMS Label Helpers
 *
 * Utilities for processing label definitions from JSON files
 */

import type { SectionDefinition, NestedLabels, FlatLabel, LabelDefinition } from '../types';

/**
 * 중첩된 라벨을 플랫화
 *
 * @param labels - 중첩된 라벨 객체
 * @returns 플랫화된 라벨 배열
 *
 * @example
 * ```ts
 * flattenLabels({
 *     nav: {
 *         home: { key: 'layout.nav.home', defaultValue: 'Home' },
 *     },
 * });
 * // => [{ key: 'layout.nav.home', defaultValue: 'Home' }]
 * ```
 */
export function flattenLabels(labels: NestedLabels): FlatLabel[]
{
    const result: FlatLabel[] = [];

    function isLabelDefinition(obj: NestedLabels | LabelDefinition): obj is LabelDefinition
    {
        return (
            'key' in obj &&
            'defaultValue' in obj &&
            typeof obj.key === 'string' &&
            (typeof obj.defaultValue === 'string' || typeof obj.defaultValue === 'object')
        );
    }

    function traverse(obj: NestedLabels | LabelDefinition)
    {
        if (isLabelDefinition(obj))
        {
            // LabelDefinition인 경우
            result.push({
                key: obj.key,
                defaultValue: obj.defaultValue,
                description: obj.description,
            });
        }
        else
        {
            // NestedLabels인 경우
            Object.values(obj).forEach((value) =>
            {
                if (typeof value === 'object' && value !== null)
                {
                    traverse(value);
                }
            });
        }
    }

    traverse(labels);
    return result;
}

/**
 * 섹션 정의에서 모든 라벨 추출
 *
 * @param definition - 섹션 정의
 * @returns 플랫화된 라벨 배열
 */
export function extractLabels(definition: SectionDefinition): FlatLabel[]
{
    return flattenLabels(definition.labels);
}
