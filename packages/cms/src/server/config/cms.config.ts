/**
 * CMS Configuration Module
 *
 * 환경변수 기반 CMS 설정 관리
 * - SPFN_CMS_DEFAULT_LOCALE: 기본 언어 (기본값: 'ko')
 * - SPFN_CMS_SUPPORTED_LOCALES: 지원 언어 목록, 쉼표로 구분 (기본값: 'ko,en')
 * - SPFN_CMS_DETECT_BROWSER_LANGUAGE: 브라우저 언어 자동 감지 (기본값: 'false')
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

/**
 * 환경변수 읽기 헬퍼
 */
function getEnvVar(key: string, defaultValue: string): string
{
    return process.env[key] || defaultValue;
}

/**
 * 환경변수에서 boolean 읽기
 */
function getEnvBoolean(key: string, defaultValue: boolean): boolean
{
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    return value === 'true' || value === '1';
}

/**
 * 환경변수에서 설정 로드
 */
function loadConfigFromEnv(): CmsConfig
{
    const defaultLocale = getEnvVar('SPFN_CMS_DEFAULT_LOCALE', 'en');
    const supportedLocalesStr = getEnvVar('SPFN_CMS_SUPPORTED_LOCALES', 'en,ko');
    const detectBrowserLanguage = getEnvBoolean('SPFN_CMS_DETECT_BROWSER_LANGUAGE', true);

    const locales = supportedLocalesStr
        .split(',')
        .map(locale => locale.trim())
        .filter(locale => locale.length > 0);

    // 기본 언어가 지원 목록에 없으면 추가
    if (!locales.includes(defaultLocale))
    {
        locales.unshift(defaultLocale);
    }

    return {
        defaultLocale,
        locales,
        supportedLocales: locales, // backward compatibility
        detectBrowserLanguage,
    };
}

/**
 * 현재 설정 (환경변수에서 초기화)
 */
let currentConfig: CmsConfig = loadConfigFromEnv();

/**
 * CMS 설정 조회
 *
 * @returns 현재 CMS 설정
 *
 * @example
 * ```tsx
 * import { getCmsConfig } from '@spfn/cms';
 *
 * const config = getCmsConfig();
 * console.log(config.defaultLocale); // 'en'
 * console.log(config.locales); // ['en', 'ko']
 * ```
 */
export function getCmsConfig(): Readonly<CmsConfig>
{
    return currentConfig;
}

/**
 * CMS 설정 변경 (런타임 오버라이드)
 *
 * 환경변수 설정을 런타임에 오버라이드합니다.
 * 주로 테스트나 특수한 경우에 사용됩니다.
 *
 * @param config - 변경할 설정 (부분 업데이트 가능)
 *
 * @example
 * ```tsx
 * import { configureCms } from '@spfn/cms';
 *
 * // 앱 초기화 시 (선택적)
 * configureCms({
 *     defaultLocale: 'en',
 *     locales: ['en', 'ko', 'ja'],
 *     detectBrowserLanguage: true,
 * });
 * ```
 */
export function configureCms(config: Partial<CmsConfig>): void
{
    // Backward compatibility: supportedLocales → locales
    if (config.supportedLocales && !config.locales)
    {
        config = { ...config, locales: config.supportedLocales };
    }

    currentConfig = {
        ...currentConfig,
        ...config,
    };

    // Sync locales ↔ supportedLocales
    if (config.locales)
    {
        currentConfig.supportedLocales = config.locales;
    }
    else if (config.supportedLocales)
    {
        currentConfig.locales = config.supportedLocales;
    }

    // 기본 언어가 지원 목록에 있는지 확인
    if (config.defaultLocale && !currentConfig.locales.includes(config.defaultLocale))
    {
        console.warn(
            `[CMS Config] Default locale '${config.defaultLocale}' not in locales, adding automatically.`,
            `Locales: [${currentConfig.locales.join(', ')}]`
        );

        currentConfig.locales.unshift(config.defaultLocale);
        currentConfig.supportedLocales.unshift(config.defaultLocale);
    }
}

/**
 * 설정 초기화 (환경변수에서 재로드)
 *
 * @example
 * ```tsx
 * import { resetCmsConfig } from '@spfn/cms';
 *
 * // 환경변수 설정으로 되돌리기
 * resetCmsConfig();
 * ```
 */
export function resetCmsConfig(): void
{
    currentConfig = loadConfigFromEnv();
}