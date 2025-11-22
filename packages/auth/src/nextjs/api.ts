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

// Import to auto-register interceptors
import './interceptors';

// Re-export interceptors for advanced usage
export {
    authInterceptors,
    loginRegisterInterceptor,
    generalAuthInterceptor,
    keyRotationInterceptor,
} from './interceptors';