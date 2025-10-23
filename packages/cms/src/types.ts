/**
 * CMS Label Definition Types
 *
 * 라이브러리 코드 - 향후 @spfn/cms로 분리 예정
 */

/**
 * 개별 라벨 정의
 */
export interface LabelDefinition
{
    key: string;
    defaultValue: string | Record<string, string>; // 다국어 지원: 문자열 또는 { ko: '...', en: '...' }
    description?: string;
}

/**
 * 중첩된 라벨 구조
 * LabelDefinition과 구분하기 위해 key, defaultValue 속성을 명시적으로 제외
 */
export type NestedLabels = {
    [key: string]: LabelDefinition | NestedLabels;
} & {
    key?: never;
    defaultValue?: never;
};

/**
 * 섹션 정의
 */
export interface SectionDefinition
{
    section: string;
    labels: NestedLabels;
}

/**
 * Sync 옵션
 */
export interface SyncOptions
{
    /**
     * Dry run - 실제로 적용하지 않고 변경사항만 출력
     */
    dryRun?: boolean;

    /**
     * 기존 라벨의 defaultValue 업데이트 여부
     */
    updateExisting?: boolean;

    /**
     * 사용되지 않는 라벨 삭제 여부
     */
    removeUnused?: boolean;

    /**
     * Verbose 출력
     */
    verbose?: boolean;
}

/**
 * Sync 결과
 */
export interface SyncResult
{
    section: string;
    created: number;
    updated: number;
    deleted: number;
    unchanged: number;
    errors: Array<{ key: string; error: string }>;
}

/**
 * 라벨 정의 플랫화된 형태
 */
export interface FlatLabel
{
    key: string;
    defaultValue: string | Record<string, string>; // 다국어 지원
    description?: string;
}