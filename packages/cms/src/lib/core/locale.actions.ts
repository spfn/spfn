"use server";

/**
 * Locale Management Server Actions
 *
 * Server Actions으로 구현된 locale 관리 함수
 * - 서버 컴포넌트: 일반 함수 호출로 동작
 * - 클라이언트 컴포넌트: Server Action으로 자동 처리
 */

import { cookies, headers } from 'next/headers.js';
import { env } from '@spfn/cms/config';
import {
    LOCALE_COOKIE_KEY,
    getLocaleInfo,
    type LocaleInfo,
} from '../constants/locale.constants';

/**
 * 브라우저 언어 감지
 *
 * Accept-Language 헤더에서 지원하는 언어를 찾습니다.
 *
 * @returns 감지된 언어 코드 또는 null
 */
async function detectBrowserLanguage(): Promise<string | null>
{
    try
    {
        const headersList = await headers();
        const acceptLanguage = headersList.get('accept-language');

        if (!acceptLanguage)
        {
            return null;
        }

        // "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7" 형식 파싱
        const languages = acceptLanguage
            .split(',')
            .map(lang =>
            {
                const [code] = lang.split(';');
                return code.split('-')[0].trim();
            });

        // 지원하는 언어 중 첫 번째 매칭되는 언어 반환
        for (const lang of languages)
        {
            if (env.SPFN_CMS_LOCALES.includes(lang))
            {
                return lang;
            }
        }

        return null;
    }
    catch (error)
    {
        // 헤더 접근 실패 시
        return null;
    }
}

/**
 * 현재 locale 가져오기 (Server Action)
 *
 * 서버/클라이언트 컴포넌트 모두에서 사용 가능
 *
 * 우선순위:
 * 1. 쿠키 (사용자가 명시적으로 선택한 언어)
 * 2. 브라우저 언어 감지 (설정에서 활성화된 경우)
 * 3. 시스템 기본 언어 (CMS 설정)
 *
 * @returns 현재 locale (예: 'ko', 'en')
 *
 * @example
 * ```tsx
 * // Server Component
 * import { getLocale } from '@spfn/cms/actions';
 *
 * export default async function Page()
 * {
 *     const locale = await getLocale();
 *     return <div>Current locale: {locale}</div>;
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Client Component
 * 'use client';
 * import { getLocale } from '@spfn/cms/client';
 *
 * export default function LanguageSwitcher()
 * {
 *     const [locale, setLocale] = useState('');
 *
 *     useEffect(() => {
 *         getLocale().then(setLocale);
 *     }, []);
 *
 *     return <div>Current locale: {locale}</div>;
 * }
 * ```
 */
export async function getLocale(): Promise<string>
{
    // 1순위: 쿠키 (사용자가 명시적으로 선택한 언어)
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get(LOCALE_COOKIE_KEY)?.value;

    if (cookieLocale && env.SPFN_CMS_LOCALES.includes(cookieLocale))
    {
        return cookieLocale;
    }

    // 2순위: 브라우저 언어 감지 (설정에서 활성화된 경우)
    if (env.SPFN_CMS_DETECT_BROWSER_LANGUAGE)
    {
        const browserLang = await detectBrowserLanguage();
        if (browserLang)
        {
            return browserLang;
        }
    }

    // 3순위: 시스템 기본 언어
    return env.SPFN_CMS_DEFAULT_LOCALE;
}

/**
 * Locale 설정하기 (Server Action)
 *
 * 서버/클라이언트 컴포넌트 모두에서 사용 가능
 * 쿠키에 locale을 저장합니다.
 *
 * @param locale - 설정할 locale (예: 'ko', 'en')
 * @throws {Error} 지원하지 않는 locale인 경우
 *
 * @example
 * ```tsx
 * // Server Component (Server Action)
 * import { setLocale } from '@spfn/cms/actions';
 *
 * export default async function Page()
 * {
 *     await setLocale('en');
 *     return <div>Locale changed</div>;
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Client Component (Server Action)
 * 'use client';
 * import { setLocale } from '@spfn/cms/client';
 *
 * export default function LanguageSwitcher()
 * {
 *     const handleChange = async (newLocale: string) =>
 *     {
 *         await setLocale(newLocale);
 *         window.location.reload(); // 페이지 새로고침
 *     };
 *
 *     return (
 *         <button onClick={() => handleChange('en')}>
 *             Switch to English
 *         </button>
 *     );
 * }
 * ```
 */
export async function setLocale(locale: string): Promise<void>
{
    // 유효성 검사
    if (!env.SPFN_CMS_LOCALES.includes(locale))
    {
        throw new Error(
            `Unsupported locale: ${locale}. Supported locales: ${env.SPFN_CMS_LOCALES}`
        );
    }

    const cookieStore = await cookies();

    cookieStore.set(LOCALE_COOKIE_KEY, locale, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365, // 1년
        sameSite: 'lax',
    });
}

/**
 * 지원하는 locale 목록 가져오기 (Server Action)
 *
 * 서버/클라이언트 컴포넌트 모두에서 사용 가능
 *
 * @returns 지원하는 locale 배열 (예: ['ko', 'en', 'ja'])
 *
 * @example
 * ```tsx
 * // Server Component
 * import { getLocales } from '@spfn/cms/actions';
 *
 * export default async function Page()
 * {
 *     const locales = await getLocales();
 *     return <div>Supported: {locales.join(', ')}</div>;
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Client Component
 * 'use client';
 * import { getLocales } from '@spfn/cms/client';
 *
 * export default function LanguageSwitcher()
 * {
 *     const [locales, setLocales] = useState<string[]>([]);
 *
 *     useEffect(() => {
 *         getLocales().then(setLocales);
 *     }, []);
 *
 *     return (
 *         <div>
 *             {locales.map(locale => (
 *                 <button key={locale}>{locale}</button>
 *             ))}
 *         </div>
 *     );
 * }
 * ```
 */
export function getLocales(): string[]
{
    return env.SPFN_CMS_LOCALES.split(',');
}

export async function getLocaleWithInfo(): Promise<{
    locale: string;
    info: LocaleInfo | undefined;
}>
{
    const locale = await getLocale();
    const info = getLocaleInfo(locale);

    return { locale, info };
}

export function getLocalesWithInfo(): LocaleInfo[]
{
    return env.SPFN_CMS_LOCALES.split(',')
        .map(locale => getLocaleInfo(locale))
        .filter((info): info is LocaleInfo => info !== undefined);
}