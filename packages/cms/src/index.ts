import "server-only";

/**
 * @spfn/cms
 *
 * Backend + Server Components
 * 백엔드 및 서버 컴포넌트 전용 (서버에서만 실행)
 *
 * For client components, use: import { ... } from '@spfn/cms/client'
 */

// Server Components API (React Server Components)
export * from './server';
export type { SectionData, SectionAPI } from './server';

// Backend: Repositories (DB access)
export * from './repositories';

// Backend: Entities (DB schemas)
export * from './entities';

// Backend: Sync utilities (server startup, CLI scripts)
export { syncSection, syncAll, initLabelSync } from './helpers/sync';

// Backend: Label definition helpers
export * from './labels';

// Backend: Codegen generators (for development)
export { createLabelSyncGenerator, LabelSyncGenerator } from './generators/label-sync-generator';

// Types
export type * from './types';
