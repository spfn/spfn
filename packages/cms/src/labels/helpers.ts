/**
 * CMS Label Definition Helpers
 *
 * 라이브러리 코드 - 향후 @spfn/cms로 분리 예정
 */

import type { SectionDefinition, NestedLabels, FlatLabel, LabelDefinition } from '../types';

/**
 * 등록된 섹션 저장소
 */
const registeredSections = new Map<string, SectionDefinition>();

/**
 * 섹션 라벨 정의 헬퍼
 * 정의된 섹션을 자동으로 등록하여 sync 시 사용
 *
 * @param section - 섹션 이름
 * @param labels - 중첩된 라벨 정의
 * @returns SectionDefinition
 *
 * @example
 * ```ts
 * export const layoutLabels = defineLabelSection('layout', {
 *     nav: {
 *         home: { key: 'layout.nav.home', defaultValue: 'Home' },
 *     },
 * });
 * ```
 */
export function defineLabelSection(
    section: string,
    labels: NestedLabels
): SectionDefinition
{
    const definition: SectionDefinition = {
        section,
        labels,
    };

    // 자동 등록
    registeredSections.set(section, definition);

    return definition;
}

/**
 * 등록된 모든 섹션 가져오기
 */
export function getRegisteredSections(): SectionDefinition[]
{
    return Array.from(registeredSections.values());
}

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
