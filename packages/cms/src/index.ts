/**
 * @spfn/cms
 *
 * Common Module (Configuration, Constants, Types)
 * 공통 모듈 (설정, 상수, 타입)
 *
 * Import structure:
 * - @spfn/cms         - Common (config, constants, types)
 * - @spfn/cms/server  - Server-side (backend + server components)
 * - @spfn/cms/client  - Client-side (hooks, stores)
 * - @spfn/cms/api     - Admin API (labels CRUD)
 */

// ============================================================================
// Configuration API
// ============================================================================

export { getCmsConfig, configureCms, resetCmsConfig } from './server/config/cms.config';
export type { CmsConfig } from './server/config/cms.config';

// ============================================================================
// Constants
// ============================================================================

export { DEFAULT_LABELS_DIR } from './lib/constants/index';

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
} from './lib/constants/locale.constants';

// ============================================================================
// Common Types
// ============================================================================

export type { SectionData, SectionAPI } from './server';
export type * from './lib/types/index';
