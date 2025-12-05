/**
 * API Client Configuration
 *
 * Type-safe client for accessing server routes
 */

import { createApi } from '@spfn/core/nextjs';
import type { AppRouter } from '@/server/router';

/**
 * Pre-configured type-safe API client
 *
 * Uses RPC proxy pattern - no metadata required.
 * Route resolution happens at the proxy layer.
 *
 * @example
 * ```typescript
 * import { api } from '@/lib/api-client';
 *
 * // Structured input pattern
 * const user = await api.getExample.call({ params: { id: '123' } });
 *
 * // With query parameters
 * const list = await api.listExamples.call({ query: { page: 1, limit: 10 } });
 *
 * // With body
 * const created = await api.createExample.call({
 *     body: { name: 'New Example' }
 * });
 *
 * // Auth routes (nested)
 * const session = await api.auth.getAuthSession.call({});
 * ```
 *
 * Works in:
 * - Server Components
 * - Client Components (proxied through /api/rpc)
 * - Server Actions
 * - Route Handlers
 */
export const api = createApi<AppRouter>();