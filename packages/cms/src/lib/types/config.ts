/**
 * CMS Configuration Types
 *
 * 순수 타입 정의 - 서버/클라이언트 모두에서 사용 가능
 */

/**
 * CMS 설정 타입
 */
export interface CmsConfig
{
    /**
     * 기본 언어 코드
     * @example 'ko', 'en', 'ja'
     */
    defaultLocale: string;

    /**
     * 프로젝트에서 사용할 언어 목록
     * @example ['ko', 'en', 'ja']
     */
    locales: string[];

    /**
     * @deprecated Use 'locales' instead
     * @internal For backward compatibility
     */
    supportedLocales: string[];

    /**
     * 브라우저 언어 자동 감지 여부
     * @default true
     */
    detectBrowserLanguage: boolean;
}