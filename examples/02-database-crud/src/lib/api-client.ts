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
 * Route resolution happens at the proxy layer (/api/rpc/[routeName]).
 *
 * @example
 * ```typescript
 * import { api } from '@/lib/api-client';
 *
 * // List (typed query + response)
 * const { examples, total } = await api.listExamples.call({ query: { limit: 10 } });
 *
 * // Create
 * const created = await api.createExample.call({
 *     body: { name: 'Hello', description: 'from the demo' },
 * });
 * ```
 *
 * Works in:
 * - Server Components
 * - Client Components (proxied through /api/rpc)
 * - Server Actions
 * - Route Handlers
 */
export const api = createApi<AppRouter>();
