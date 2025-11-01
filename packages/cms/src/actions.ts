/**
 * @spfn/cms/actions
 *
 * Server Actions
 * 서버/클라이언트 컴포넌트 양쪽에서 사용 가능한 Server Actions
 */

// Locale Server Actions
export {
    getLocale,
    setLocale,
    getLocales,
} from './helpers/locale.actions';

// Locale Constants
export { LOCALE_COOKIE_KEY } from './helpers/locale.constants';