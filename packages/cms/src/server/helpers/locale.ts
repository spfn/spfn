import "server-only";

/**
 * Locale Management Module (Server Components)
 *
 * 서버 컴포넌트용 locale 관리 (Server Actions re-export)
 * 실제 구현은 locale.actions.ts 참조
 */

export {
    getLocale,
    setLocale,
    getLocales,
    getLocaleWithInfo,
    getLocalesWithInfo,
} from './locale.actions';

export {
    LOCALE_COOKIE_KEY,
    getLocaleInfo,
    getSupportedLocales,
    getFlag,
    getDialCode,
    isRTL,
    LOCALE_INFO_MAP,
    type LocaleInfo,
    type SupportedLocale,
} from './locale.constants';

/**
 * Locale 유효성 검사
 *
 * @param locale - 검사할 locale
 * @returns 지원 여부
 */
export async function isValidLocale(locale: string): Promise<boolean>
{
    const locales = await import('./locale.actions.js').then(m => m.getLocales());
    return locales.includes(locale);
}