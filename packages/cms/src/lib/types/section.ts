/**
 * CMS Section Types
 *
 * 순수 타입 정의 - 서버/클라이언트 모두에서 사용 가능
 * 이 파일은 서버 사이드 의존성이 없어야 합니다.
 */

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
export type TranslationFunction = (
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
    t: TranslationFunction;

    /**
     * 섹션 데이터
     */
    data: SectionData;
};