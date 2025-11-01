/**
 * Locale Constants
 *
 * Server/Client 양쪽에서 사용 가능한 locale 관련 상수
 */

/**
 * Locale 쿠키 키
 */
export const LOCALE_COOKIE_KEY = 'spfn-locale';

/**
 * 지원하는 Locale 타입 (Type-safe)
 */
export type SupportedLocale =
    // 아시아-태평양
    | 'ko'      // 한국어
    | 'ja'      // 일본어
    | 'zh'      // 중국어 (간체)
    | 'zh-TW'   // 중국어 (번체, 대만)
    | 'zh-HK'   // 중국어 (홍콩)
    | 'hi'      // 힌디어
    | 'th'      // 태국어
    | 'vi'      // 베트남어
    | 'id'      // 인도네시아어
    | 'ms'      // 말레이어
    // 영어권
    | 'en'      // 영어 (미국)
    | 'en-GB'   // 영어 (영국)
    | 'en-CA'   // 영어 (캐나다)
    | 'en-AU'   // 영어 (호주)
    | 'en-NZ'   // 영어 (뉴질랜드)
    // 서유럽
    | 'es'      // 스페인어 (스페인)
    | 'es-MX'   // 스페인어 (멕시코)
    | 'es-AR'   // 스페인어 (아르헨티나)
    | 'es-CO'   // 스페인어 (콜롬비아)
    | 'fr'      // 프랑스어
    | 'de'      // 독일어
    | 'it'      // 이탈리아어
    | 'pt'      // 포르투갈어
    | 'nl'      // 네덜란드어
    // 북유럽
    | 'sv'      // 스웨덴어
    | 'no'      // 노르웨이어
    | 'da'      // 덴마크어
    | 'fi'      // 핀란드어
    // 동유럽
    | 'ru'      // 러시아어
    | 'pl'      // 폴란드어
    | 'uk'      // 우크라이나어
    | 'cs'      // 체코어
    | 'hu'      // 헝가리어
    | 'ro'      // 루마니아어
    | 'bg'      // 불가리아어
    | 'hr'      // 크로아티아어
    | 'sr'      // 세르비아어
    | 'sk'      // 슬로바키아어
    | 'sl'      // 슬로베니아어
    | 'lt'      // 리투아니아어
    | 'lv'      // 라트비아어
    | 'et'      // 에스토니아어
    // 남유럽
    | 'el'      // 그리스어
    // 중동
    | 'tr'      // 터키어
    | 'ar'      // 아랍어
    | 'fa'      // 페르시아어
    | 'he'      // 히브리어
    // 아프리카
    | 'sw';     // 스와힐리어

/**
 * 국가/지역 정보 타입
 */
export interface LocaleInfo
{
    /** Locale 코드 (ISO 639-1) */
    locale: SupportedLocale;
    /** 국가 코드 (ISO 3166-1 alpha-2) */
    countryCode: string;
    /** 국기 이모지 (HTML/React용) */
    flag: string;
    /** 전화번호 국가 코드 */
    dialCode: string;
    /** 네이티브 이름 (현지어) */
    nativeName: string;
    /** 영어 이름 */
    englishName: string;
    /** RTL (Right-to-Left) 여부 */
    rtl?: boolean;
    /** 통화 코드 (ISO 4217) */
    currencyCode?: string;
    /** 날짜 형식 예시 */
    dateFormat?: string;
}

/**
 * 사전 정의된 Locale 정보 맵
 *
 * 주요 언어/국가 정보를 포함합니다.
 * 프로젝트에 맞게 추가/수정 가능합니다.
 */
export const LOCALE_INFO_MAP: Record<SupportedLocale, LocaleInfo> = {
    // 한국어
    ko: {
        locale: 'ko',
        countryCode: 'KR',
        flag: '&#x1F1F0;&#x1F1F7;',
        dialCode: '+82',
        nativeName: '한국어',
        englishName: 'Korean',
        currencyCode: 'KRW',
        dateFormat: 'YYYY.MM.DD',
    },

    // 영어 (미국)
    en: {
        locale: 'en',
        countryCode: 'US',
        flag: '&#x1F1FA;&#x1F1F8;',
        dialCode: '+1',
        nativeName: 'English',
        englishName: 'English',
        currencyCode: 'USD',
        dateFormat: 'MM/DD/YYYY',
    },

    // 일본어
    ja: {
        locale: 'ja',
        countryCode: 'JP',
        flag: '&#x1F1EF;&#x1F1F5;',
        dialCode: '+81',
        nativeName: '日本語',
        englishName: 'Japanese',
        currencyCode: 'JPY',
        dateFormat: 'YYYY/MM/DD',
    },

    // 중국어 (간체)
    zh: {
        locale: 'zh',
        countryCode: 'CN',
        flag: '&#x1F1E8;&#x1F1F3;',
        dialCode: '+86',
        nativeName: '简体中文',
        englishName: 'Chinese (Simplified)',
        currencyCode: 'CNY',
        dateFormat: 'YYYY-MM-DD',
    },

    // 중국어 (번체, 대만)
    'zh-TW': {
        locale: 'zh-TW',
        countryCode: 'TW',
        flag: '&#x1F1F9;&#x1F1FC;',
        dialCode: '+886',
        nativeName: '繁體中文',
        englishName: 'Chinese (Traditional)',
        currencyCode: 'TWD',
        dateFormat: 'YYYY/MM/DD',
    },

    // 스페인어
    es: {
        locale: 'es',
        countryCode: 'ES',
        flag: '&#x1F1EA;&#x1F1F8;',
        dialCode: '+34',
        nativeName: 'Español',
        englishName: 'Spanish',
        currencyCode: 'EUR',
        dateFormat: 'DD/MM/YYYY',
    },

    // 프랑스어
    fr: {
        locale: 'fr',
        countryCode: 'FR',
        flag: '&#x1F1EB;&#x1F1F7;',
        dialCode: '+33',
        nativeName: 'Français',
        englishName: 'French',
        currencyCode: 'EUR',
        dateFormat: 'DD/MM/YYYY',
    },

    // 독일어
    de: {
        locale: 'de',
        countryCode: 'DE',
        flag: '&#x1F1E9;&#x1F1EA;',
        dialCode: '+49',
        nativeName: 'Deutsch',
        englishName: 'German',
        currencyCode: 'EUR',
        dateFormat: 'DD.MM.YYYY',
    },

    // 이탈리아어
    it: {
        locale: 'it',
        countryCode: 'IT',
        flag: '&#x1F1EE;&#x1F1F9;',
        dialCode: '+39',
        nativeName: 'Italiano',
        englishName: 'Italian',
        currencyCode: 'EUR',
        dateFormat: 'DD/MM/YYYY',
    },

    // 포르투갈어 (브라질)
    pt: {
        locale: 'pt',
        countryCode: 'BR',
        flag: '&#x1F1E7;&#x1F1F7;',
        dialCode: '+55',
        nativeName: 'Português',
        englishName: 'Portuguese',
        currencyCode: 'BRL',
        dateFormat: 'DD/MM/YYYY',
    },

    // 러시아어
    ru: {
        locale: 'ru',
        countryCode: 'RU',
        flag: '&#x1F1F7;&#x1F1FA;',
        dialCode: '+7',
        nativeName: 'Русский',
        englishName: 'Russian',
        currencyCode: 'RUB',
        dateFormat: 'DD.MM.YYYY',
    },

    // 아랍어
    ar: {
        locale: 'ar',
        countryCode: 'SA',
        flag: '&#x1F1F8;&#x1F1E6;',
        dialCode: '+966',
        nativeName: 'العربية',
        englishName: 'Arabic',
        rtl: true,
        currencyCode: 'SAR',
        dateFormat: 'DD/MM/YYYY',
    },

    // 힌디어
    hi: {
        locale: 'hi',
        countryCode: 'IN',
        flag: '&#x1F1EE;&#x1F1F3;',
        dialCode: '+91',
        nativeName: 'हिन्दी',
        englishName: 'Hindi',
        currencyCode: 'INR',
        dateFormat: 'DD/MM/YYYY',
    },

    // 태국어
    th: {
        locale: 'th',
        countryCode: 'TH',
        flag: '&#x1F1F9;&#x1F1ED;',
        dialCode: '+66',
        nativeName: 'ไทย',
        englishName: 'Thai',
        currencyCode: 'THB',
        dateFormat: 'DD/MM/YYYY',
    },

    // 베트남어
    vi: {
        locale: 'vi',
        countryCode: 'VN',
        flag: '&#x1F1FB;&#x1F1F3;',
        dialCode: '+84',
        nativeName: 'Tiếng Việt',
        englishName: 'Vietnamese',
        currencyCode: 'VND',
        dateFormat: 'DD/MM/YYYY',
    },

    // 인도네시아어
    id: {
        locale: 'id',
        countryCode: 'ID',
        flag: '&#x1F1EE;&#x1F1E9;',
        dialCode: '+62',
        nativeName: 'Bahasa Indonesia',
        englishName: 'Indonesian',
        currencyCode: 'IDR',
        dateFormat: 'DD/MM/YYYY',
    },

    // 터키어
    tr: {
        locale: 'tr',
        countryCode: 'TR',
        flag: '&#x1F1F9;&#x1F1F7;',
        dialCode: '+90',
        nativeName: 'Türkçe',
        englishName: 'Turkish',
        currencyCode: 'TRY',
        dateFormat: 'DD.MM.YYYY',
    },

    // 폴란드어
    pl: {
        locale: 'pl',
        countryCode: 'PL',
        flag: '&#x1F1F5;&#x1F1F1;',
        dialCode: '+48',
        nativeName: 'Polski',
        englishName: 'Polish',
        currencyCode: 'PLN',
        dateFormat: 'DD.MM.YYYY',
    },

    // 네덜란드어
    nl: {
        locale: 'nl',
        countryCode: 'NL',
        flag: '&#x1F1F3;&#x1F1F1;',
        dialCode: '+31',
        nativeName: 'Nederlands',
        englishName: 'Dutch',
        currencyCode: 'EUR',
        dateFormat: 'DD-MM-YYYY',
    },

    // 중국어 (홍콩)
    'zh-HK': {
        locale: 'zh-HK',
        countryCode: 'HK',
        flag: '&#x1F1ED;&#x1F1F0;',
        dialCode: '+852',
        nativeName: '繁體中文 (香港)',
        englishName: 'Chinese (Hong Kong)',
        currencyCode: 'HKD',
        dateFormat: 'YYYY/MM/DD',
    },

    // 말레이어
    ms: {
        locale: 'ms',
        countryCode: 'MY',
        flag: '&#x1F1F2;&#x1F1FE;',
        dialCode: '+60',
        nativeName: 'Bahasa Melayu',
        englishName: 'Malay',
        currencyCode: 'MYR',
        dateFormat: 'DD/MM/YYYY',
    },

    // 영어 (영국)
    'en-GB': {
        locale: 'en-GB',
        countryCode: 'GB',
        flag: '&#x1F1EC;&#x1F1E7;',
        dialCode: '+44',
        nativeName: 'English (UK)',
        englishName: 'English (United Kingdom)',
        currencyCode: 'GBP',
        dateFormat: 'DD/MM/YYYY',
    },

    // 영어 (캐나다)
    'en-CA': {
        locale: 'en-CA',
        countryCode: 'CA',
        flag: '&#x1F1E8;&#x1F1E6;',
        dialCode: '+1',
        nativeName: 'English (Canada)',
        englishName: 'English (Canada)',
        currencyCode: 'CAD',
        dateFormat: 'YYYY-MM-DD',
    },

    // 영어 (호주)
    'en-AU': {
        locale: 'en-AU',
        countryCode: 'AU',
        flag: '&#x1F1E6;&#x1F1FA;',
        dialCode: '+61',
        nativeName: 'English (Australia)',
        englishName: 'English (Australia)',
        currencyCode: 'AUD',
        dateFormat: 'DD/MM/YYYY',
    },

    // 영어 (뉴질랜드)
    'en-NZ': {
        locale: 'en-NZ',
        countryCode: 'NZ',
        flag: '&#x1F1F3;&#x1F1FF;',
        dialCode: '+64',
        nativeName: 'English (New Zealand)',
        englishName: 'English (New Zealand)',
        currencyCode: 'NZD',
        dateFormat: 'DD/MM/YYYY',
    },

    // 스페인어 (멕시코)
    'es-MX': {
        locale: 'es-MX',
        countryCode: 'MX',
        flag: '&#x1F1F2;&#x1F1FD;',
        dialCode: '+52',
        nativeName: 'Español (México)',
        englishName: 'Spanish (Mexico)',
        currencyCode: 'MXN',
        dateFormat: 'DD/MM/YYYY',
    },

    // 스페인어 (아르헨티나)
    'es-AR': {
        locale: 'es-AR',
        countryCode: 'AR',
        flag: '&#x1F1E6;&#x1F1F7;',
        dialCode: '+54',
        nativeName: 'Español (Argentina)',
        englishName: 'Spanish (Argentina)',
        currencyCode: 'ARS',
        dateFormat: 'DD/MM/YYYY',
    },

    // 스페인어 (콜롬비아)
    'es-CO': {
        locale: 'es-CO',
        countryCode: 'CO',
        flag: '&#x1F1E8;&#x1F1F4;',
        dialCode: '+57',
        nativeName: 'Español (Colombia)',
        englishName: 'Spanish (Colombia)',
        currencyCode: 'COP',
        dateFormat: 'DD/MM/YYYY',
    },

    // 스웨덴어
    sv: {
        locale: 'sv',
        countryCode: 'SE',
        flag: '&#x1F1F8;&#x1F1EA;',
        dialCode: '+46',
        nativeName: 'Svenska',
        englishName: 'Swedish',
        currencyCode: 'SEK',
        dateFormat: 'YYYY-MM-DD',
    },

    // 노르웨이어
    no: {
        locale: 'no',
        countryCode: 'NO',
        flag: '&#x1F1F3;&#x1F1F4;',
        dialCode: '+47',
        nativeName: 'Norsk',
        englishName: 'Norwegian',
        currencyCode: 'NOK',
        dateFormat: 'DD.MM.YYYY',
    },

    // 덴마크어
    da: {
        locale: 'da',
        countryCode: 'DK',
        flag: '&#x1F1E9;&#x1F1F0;',
        dialCode: '+45',
        nativeName: 'Dansk',
        englishName: 'Danish',
        currencyCode: 'DKK',
        dateFormat: 'DD-MM-YYYY',
    },

    // 핀란드어
    fi: {
        locale: 'fi',
        countryCode: 'FI',
        flag: '&#x1F1EB;&#x1F1EE;',
        dialCode: '+358',
        nativeName: 'Suomi',
        englishName: 'Finnish',
        currencyCode: 'EUR',
        dateFormat: 'DD.MM.YYYY',
    },

    // 우크라이나어
    uk: {
        locale: 'uk',
        countryCode: 'UA',
        flag: '&#x1F1FA;&#x1F1E6;',
        dialCode: '+380',
        nativeName: 'Українська',
        englishName: 'Ukrainian',
        currencyCode: 'UAH',
        dateFormat: 'DD.MM.YYYY',
    },

    // 체코어
    cs: {
        locale: 'cs',
        countryCode: 'CZ',
        flag: '&#x1F1E8;&#x1F1FF;',
        dialCode: '+420',
        nativeName: 'Čeština',
        englishName: 'Czech',
        currencyCode: 'CZK',
        dateFormat: 'DD.MM.YYYY',
    },

    // 헝가리어
    hu: {
        locale: 'hu',
        countryCode: 'HU',
        flag: '&#x1F1ED;&#x1F1FA;',
        dialCode: '+36',
        nativeName: 'Magyar',
        englishName: 'Hungarian',
        currencyCode: 'HUF',
        dateFormat: 'YYYY.MM.DD.',
    },

    // 루마니아어
    ro: {
        locale: 'ro',
        countryCode: 'RO',
        flag: '&#x1F1F7;&#x1F1F4;',
        dialCode: '+40',
        nativeName: 'Română',
        englishName: 'Romanian',
        currencyCode: 'RON',
        dateFormat: 'DD.MM.YYYY',
    },

    // 불가리아어
    bg: {
        locale: 'bg',
        countryCode: 'BG',
        flag: '&#x1F1E7;&#x1F1EC;',
        dialCode: '+359',
        nativeName: 'Български',
        englishName: 'Bulgarian',
        currencyCode: 'BGN',
        dateFormat: 'DD.MM.YYYY',
    },

    // 크로아티아어
    hr: {
        locale: 'hr',
        countryCode: 'HR',
        flag: '&#x1F1ED;&#x1F1F7;',
        dialCode: '+385',
        nativeName: 'Hrvatski',
        englishName: 'Croatian',
        currencyCode: 'HRK',
        dateFormat: 'DD.MM.YYYY.',
    },

    // 세르비아어
    sr: {
        locale: 'sr',
        countryCode: 'RS',
        flag: '&#x1F1F7;&#x1F1F8;',
        dialCode: '+381',
        nativeName: 'Српски',
        englishName: 'Serbian',
        currencyCode: 'RSD',
        dateFormat: 'DD.MM.YYYY.',
    },

    // 슬로바키아어
    sk: {
        locale: 'sk',
        countryCode: 'SK',
        flag: '&#x1F1F8;&#x1F1F0;',
        dialCode: '+421',
        nativeName: 'Slovenčina',
        englishName: 'Slovak',
        currencyCode: 'EUR',
        dateFormat: 'DD.MM.YYYY',
    },

    // 슬로베니아어
    sl: {
        locale: 'sl',
        countryCode: 'SI',
        flag: '&#x1F1F8;&#x1F1EE;',
        dialCode: '+386',
        nativeName: 'Slovenščina',
        englishName: 'Slovenian',
        currencyCode: 'EUR',
        dateFormat: 'DD.MM.YYYY',
    },

    // 리투아니아어
    lt: {
        locale: 'lt',
        countryCode: 'LT',
        flag: '&#x1F1F1;&#x1F1F9;',
        dialCode: '+370',
        nativeName: 'Lietuvių',
        englishName: 'Lithuanian',
        currencyCode: 'EUR',
        dateFormat: 'YYYY-MM-DD',
    },

    // 라트비아어
    lv: {
        locale: 'lv',
        countryCode: 'LV',
        flag: '&#x1F1F1;&#x1F1FB;',
        dialCode: '+371',
        nativeName: 'Latviešu',
        englishName: 'Latvian',
        currencyCode: 'EUR',
        dateFormat: 'DD.MM.YYYY.',
    },

    // 에스토니아어
    et: {
        locale: 'et',
        countryCode: 'EE',
        flag: '&#x1F1EA;&#x1F1EA;',
        dialCode: '+372',
        nativeName: 'Eesti',
        englishName: 'Estonian',
        currencyCode: 'EUR',
        dateFormat: 'DD.MM.YYYY',
    },

    // 그리스어
    el: {
        locale: 'el',
        countryCode: 'GR',
        flag: '&#x1F1EC;&#x1F1F7;',
        dialCode: '+30',
        nativeName: 'Ελληνικά',
        englishName: 'Greek',
        currencyCode: 'EUR',
        dateFormat: 'DD/MM/YYYY',
    },

    // 페르시아어
    fa: {
        locale: 'fa',
        countryCode: 'IR',
        flag: '&#x1F1EE;&#x1F1F7;',
        dialCode: '+98',
        nativeName: 'فارسی',
        englishName: 'Persian',
        rtl: true,
        currencyCode: 'IRR',
        dateFormat: 'YYYY/MM/DD',
    },

    // 히브리어
    he: {
        locale: 'he',
        countryCode: 'IL',
        flag: '&#x1F1EE;&#x1F1F1;',
        dialCode: '+972',
        nativeName: 'עברית',
        englishName: 'Hebrew',
        rtl: true,
        currencyCode: 'ILS',
        dateFormat: 'DD/MM/YYYY',
    },

    // 스와힐리어
    sw: {
        locale: 'sw',
        countryCode: 'KE',
        flag: '&#x1F1F0;&#x1F1EA;',
        dialCode: '+254',
        nativeName: 'Kiswahili',
        englishName: 'Swahili',
        currencyCode: 'KES',
        dateFormat: 'DD/MM/YYYY',
    },
};

/**
 * Locale 정보 가져오기
 *
 * @param locale - Locale 코드 (예: 'ko', 'en', 'ja')
 * @returns LocaleInfo 또는 undefined
 *
 * @example
 * ```typescript
 * const koInfo = getLocaleInfo('ko');
 * console.log(koInfo.flag); // 🇰🇷
 * console.log(koInfo.dialCode); // +82
 * ```
 */
export function getLocaleInfo(locale: string): LocaleInfo | undefined
{
    return LOCALE_INFO_MAP[locale as SupportedLocale];
}

/**
 * 지원하는 모든 Locale 목록 가져오기
 *
 * @returns Locale 코드 배열
 */
export function getSupportedLocales(): SupportedLocale[]
{
    return Object.keys(LOCALE_INFO_MAP) as SupportedLocale[];
}

/**
 * 국기 이모지만 가져오기
 *
 * @param locale - Locale 코드
 * @returns 국기 이모지 또는 빈 문자열
 *
 * @example
 * ```typescript
 * getFlag('ko'); // 🇰🇷
 * getFlag('en'); // 🇺🇸
 * ```
 */
export function getFlag(locale: string): string
{
    return LOCALE_INFO_MAP[locale as SupportedLocale]?.flag ?? '';
}

/**
 * 전화번호 국가 코드 가져오기
 *
 * @param locale - Locale 코드
 * @returns 전화번호 코드 또는 빈 문자열
 *
 * @example
 * ```typescript
 * getDialCode('ko'); // +82
 * getDialCode('en'); // +1
 * ```
 */
export function getDialCode(locale: string): string
{
    return LOCALE_INFO_MAP[locale as SupportedLocale]?.dialCode ?? '';
}

/**
 * RTL (Right-to-Left) 여부 확인
 *
 * @param locale - Locale 코드
 * @returns RTL 여부
 *
 * @example
 * ```typescript
 * isRTL('ar'); // true (Arabic)
 * isRTL('ko'); // false (Korean)
 * ```
 */
export function isRTL(locale: string): boolean
{
    return LOCALE_INFO_MAP[locale as SupportedLocale]?.rtl ?? false;
}