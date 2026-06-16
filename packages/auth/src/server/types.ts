/**
 * @spfn/auth - Shared Types
 *
 * Common types and constants used across the auth package
 */

/**
 * Supported JWT signature algorithms
 *
 * - ES256: ECDSA with P-256 and SHA-256 (recommended, smaller keys)
 * - RS256: RSA with SHA-256 (fallback, larger keys)
 */
export const KEY_ALGORITHM = ['ES256', 'RS256'] as const;

/**
 * Key algorithm type derived from the const array
 */
export type KeyAlgorithmType = typeof KEY_ALGORITHM[number];

/**
 * Invitation status enum values
 * Single source of truth for all invitation statuses
 */
export const INVITATION_STATUSES = ['pending', 'accepted', 'expired', 'cancelled'] as const;

/**
 * Invitation status type derived from the const array
 */
export type InvitationStatus = typeof INVITATION_STATUSES[number];

/**
 * User status enum values
 * Single source of truth for all user statuses
 */
export const USER_STATUSES = ['active', 'inactive', 'suspended'] as const;

/**
 * User status type derived from the const array
 */
export type UserStatus = typeof USER_STATUSES[number];

/**
 * Social provider enum values
 * Single source of truth for supported OAuth providers
 */
export const SOCIAL_PROVIDERS = ['google', 'apple', 'github', 'kakao', 'naver', 'superself'] as const;

/**
 * Social provider type derived from the const array
 */
export type SocialProvider = typeof SOCIAL_PROVIDERS[number];
