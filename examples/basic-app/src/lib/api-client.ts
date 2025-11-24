/**
 * API Client Configuration
 *
 * Type-safe client for accessing server routes
 */

import { createApi } from '@spfn/core/nextjs';
import type { AppRouter } from '@/server/router';
import { appMetadata as authAppMetadata } from "@spfn/auth";
import { authErrorRegistry } from "@spfn/auth/errors";
import { appMetadata } from '@/server/router.metadata';
import { errorRegistry } from "@spfn/core/errors";
import { InsufficientBalanceError } from "@/lib/errors/custom-errors";

/**
 * Pre-configured type-safe API client
 *
 * Core HTTP errors are automatically registered.
 * Add custom application errors via the errors field if needed.
 *
 * @example
 * ```typescript
 * import { api } from '@/lib/api-client';
 *
 * // Basic call
 * const user = await api.getUser
 *     .params({ id: '123' })
 *     .call();
 *
 * // Error handling with instanceof
 * try {
 *     await api.someRoute.call();
 * } catch (error) {
 *     if (error instanceof NotFoundError) {
 *         console.log('Resource not found');
 *     } else if (error instanceof ValidationError) {
 *         console.log('Validation failed:', error.fields);
 *     }
 * }
 * ```
 *
 * Works in:
 * - Server Components (no router import needed)
 * - Client Components (proxied through /api/actions)
 * - Server Actions
 * - Route Handlers
 */
export const api = createApi<AppRouter>({
    metadata: { ...appMetadata, ...{ auth: authAppMetadata } },
    errorRegistry: errorRegistry
        .concat(authErrorRegistry)
        .append([InsufficientBalanceError]),  // Add custom errors here
    debug: true
});