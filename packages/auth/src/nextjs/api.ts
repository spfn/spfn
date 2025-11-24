/**
 * @spfn/auth/adapters/nextjs/api
 *
 * Next.js Adapter for SPFN Auth
 *
 * Provides automatic interceptor registration for seamless auth flow:
 * - Session management (HttpOnly cookies)
 * - JWT generation and signing
 * - Public key encryption
 *
 * @requires next >= 13.0.0
 *
 * @example
 * ```typescript
 * // Just import to auto-register interceptors
 * import '@spfn/auth/nextjs/api';
 * ```
 */

// Re-export interceptors for advanced usage
import { registerInterceptors } from "@spfn/core/nextjs/server";
import { authInterceptors } from './interceptors';

// Auto-register interceptors on import
registerInterceptors('auth', authInterceptors);