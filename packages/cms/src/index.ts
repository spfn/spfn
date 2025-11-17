/**
 * @spfn/cms
 *
 * Common Module (Constants, Types)
 * 공통 모듈 (상수, 타입)
 *
 * Import structure:
 * - @spfn/cms         - Common (constants, types)
 * - @spfn/cms/server  - Server-side (backend + server components + config)
 * - @spfn/cms/client  - Client-side (hooks, stores)
 * - @spfn/cms/api     - Admin API (labels CRUD)
 */

// ============================================================================
// Constants
// ============================================================================

// Note: DEFAULT_LABELS_DIR and DEFAULT_LOCALES have been moved to environment variable schema
// See packages/cms/src/server/config/env.config.ts for configuration

export {
    LOCALE_COOKIE_KEY,
    getLocaleInfo,
    getAllLocales,
    getFlag,
    getDialCode,
    isRTL,
    LOCALE_INFO_MAP,
    type LocaleInfo,
    type SupportedLocale,
} from './lib/constants/locale.constants';

// ============================================================================
// Common Types
// ============================================================================

export type { SectionData, SectionAPI, TranslationFunction } from './lib/types/section';
export type * from './lib/types';
export * from './server/helpers/error';
export type { CmsLabel, CmsLabelValue } from './lib/contracts/labels';