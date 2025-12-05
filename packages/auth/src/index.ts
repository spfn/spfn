// ============================================================================
// API Client
// ============================================================================

import { createApi } from '@spfn/core/nextjs';
import { mainAuthRouter } from './server/routes';

/**
 * Type-safe API client for auth routes
 *
 * @example
 * ```typescript
 * import { authApi } from '@spfn/auth';
 *
 * // Get current session
 * const session = await authApi.getAuthSession.call({});
 *
 * // Login
 * const result = await authApi.login.call({
 *     body: { email, password, fingerprint, publicKey, keyId }
 * });
 * ```
 */
export const authApi = createApi<typeof mainAuthRouter>();

// Router type for external use
export type AuthRouter = typeof mainAuthRouter;

// ============================================================================
// RBAC (Roles, Permissions, Types)
// ============================================================================

export type { AuthSession, UserProfile, ProfileInfo } from './lib';
export { UUID_PATTERN, EMAIL_PATTERN, BASE64_PATTERN, FINGERPRINT_PATTERN, PHONE_PATTERN } from './lib';
export * from './server/rbac';

// ============================================================================
// Types & Constants (Single Source of Truth)
// ============================================================================

// Export all types from types.ts
export type * from './server/types';

// Export runtime constants for validation and type narrowing
export {
    KEY_ALGORITHM,
    INVITATION_STATUSES,
    USER_STATUSES,
    SOCIAL_PROVIDERS,
} from './server/types';

// Export verification types & constants from schema.ts (single source of truth)
export type { VerificationTargetType, VerificationPurpose } from './server/routes/schema';
export {
    VERIFICATION_TARGET_TYPES,
    VERIFICATION_PURPOSES,
} from './server/routes/schema';