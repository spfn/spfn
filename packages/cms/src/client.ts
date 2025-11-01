/**
 * @spfn/cms/client
 *
 * Client Components Only
 * 클라이언트 컴포넌트 전용 (브라우저에서 실행)
 *
 * For CMS management API (admin), use: import { cmsApi } from '@spfn/cms/api'
 */

// Client-side Store & Hooks
export { useCmsStore, useSection, useSections } from './client';

// Client-side Initializer
export { InitCms } from './client';

// Locale Management (Server Actions - callable from client)
export {
    getLocale,
    setLocale,
    getLocales,
    getLocaleWithInfo,
    getLocalesWithInfo,
} from '@/server/helpers/locale.actions';

// Locale Constants (client-accessible)
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
} from '@/lib/constants/locale.constants';