/**
 * SPFN Client Module
 *
 * Client-side utilities for browser and Next.js client components
 * Safe to import in Next.js - no server dependencies
 *
 * @example
 * ```ts
 * import { get, post } from '@spfn/core/client';
 * const users = await get<User[]>('/users');
 * ```
 */

// Fetch helpers
export { get, post, patch, del } from './fetch.js';