/**
 * API Client Configuration
 *
 * Type-safe client for accessing server routes.
 * Core HTTP errors are automatically registered.
 *
 * @example
 * ```typescript
 * import { api } from '@/lib/api-client';
 *
 * // Basic call
 * const user = await api.getUser.call({ params: { id: '123' } });
 *
 * // With options
 * const data = await api.getData
 *     .headers({ 'X-Custom': 'value' })
 *     .fetchOptions({ next: { revalidate: 60 } })
 *     .call({ query: { page: 1 } });
 * ```
 */

import { createApi } from '@spfn/core/nextjs';
import type { AppRouter } from '@/server/router';

export const api = createApi<AppRouter>({
    /**
     * Base URL for RPC endpoint
     * @default '/api/rpc'
     */
    // baseUrl: '/api/rpc',

    /**
     * Default headers for all requests
     */
    // headers: { 'X-Client': 'web' },

    /**
     * Request timeout in milliseconds
     * @default 30000
     */
    // timeout: 30000,

    /**
     * Custom error registry for deserialization
     * Core HTTP errors are automatically included.
     *
     * @example
     * import { authErrorRegistry } from '@myapp/auth/errors';
     * errorRegistry: [authErrorRegistry, MyCustomError]
     */
    // errorRegistry: [],

    /**
     * Global request interceptor
     *
     * @example
     * onRequest: async (url, init) => {
     *     init.headers = { ...init.headers, 'X-Request-Id': crypto.randomUUID() };
     *     return init;
     * }
     */
    // onRequest: async (url, init) => init,

    /**
     * Global response interceptor
     *
     * @example
     * onResponse: async (response, body) => {
     *     if (response.status === 401) redirect('/login');
     *     return { response, body };
     * }
     */
    // onResponse: async (response, body) => ({ response, body }),

    /**
     * Enable debug logging
     * @default false
     */
    debug: process.env.NODE_ENV === 'development',
});
