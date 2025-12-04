// ============================================================================
// RBAC (Roles, Permissions, Types)
// ============================================================================

export type { AuthSession, UserProfile, ProfileInfo } from './lib';
export { UUID_PATTERN, EMAIL_PATTERN, BASE64_PATTERN, FINGERPRINT_PATTERN, PHONE_PATTERN } from './lib';
export * from './server/rbac';
export * from './server/routes/router.metadata';

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