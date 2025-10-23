/**
 * @spfn/cms
 *
 * Content Management System for Next.js with type-safe labels
 */

// Server-side (React Server Components)
export * from './server';

// Client-side API
export { cmsApi } from './client';
export type { CmsApi } from './client';

// Client-side Store & Hooks
export { useCmsStore, useSection, useSections } from './store';

// Client-side Initializer
export { InitCms } from './init';

// Label Helpers
export * from './labels';

// Types
export type * from './types';
