/**
 * Auth Environment Variable Configuration Types
 *
 * Type definitions for Auth environment variables
 */

/**
 * Auth environment variables configuration
 */
export interface AuthEnvConfig
{
    // ============================================================================
    // Session Configuration
    // ============================================================================

    /** Session encryption secret (minimum 32 characters for AES-256) */
    SPFN_AUTH_SESSION_SECRET: string;

    /** Session TTL (time to live) - supports duration strings like '7d', '12h', '45m' */
    SPFN_AUTH_SESSION_TTL?: string;

    // ============================================================================
    // JWT Configuration
    // ============================================================================

    /** JWT signing secret for server-signed tokens (legacy mode) */
    SPFN_AUTH_JWT_SECRET?: string;

    /** JWT token expiration time (e.g., '7d', '24h', '1h') */
    SPFN_AUTH_JWT_EXPIRES_IN?: string;

    // ============================================================================
    // Security Configuration
    // ============================================================================

    /** Bcrypt salt rounds (cost factor, higher = more secure but slower) */
    SPFN_AUTH_BCRYPT_SALT_ROUNDS?: number;

    /** Verification token secret for email verification, password reset, etc. */
    SPFN_AUTH_VERIFICATION_TOKEN_SECRET?: string;

    // ============================================================================
    // Admin Account Configuration
    // ============================================================================

    /** JSON array of admin accounts (recommended for multiple admins) */
    SPFN_AUTH_ADMIN_ACCOUNTS?: string;

    /** Comma-separated list of admin emails (legacy CSV format) */
    SPFN_AUTH_ADMIN_EMAILS?: string;

    /** Comma-separated list of admin passwords (legacy CSV format) */
    SPFN_AUTH_ADMIN_PASSWORDS?: string;

    /** Comma-separated list of admin roles (legacy CSV format) */
    SPFN_AUTH_ADMIN_ROLES?: string;

    /** Single admin email (simplest format) */
    SPFN_AUTH_ADMIN_EMAIL?: string;

    /** Single admin password (simplest format) */
    SPFN_AUTH_ADMIN_PASSWORD?: string;

    // ============================================================================
    // API Configuration
    // ============================================================================

    /** Base API URL for invitation links and other external-facing URLs */
    SPFN_API_URL?: string;

    // ============================================================================
    // Legacy Backward Compatibility (Deprecated)
    // ============================================================================

    /** @deprecated Use SPFN_AUTH_SESSION_SECRET instead */
    SESSION_SECRET?: string;

    /** @deprecated Use SPFN_AUTH_JWT_SECRET instead */
    JWT_SECRET?: string;

    /** @deprecated Use SPFN_AUTH_JWT_EXPIRES_IN instead */
    JWT_EXPIRES_IN?: string;

    /** @deprecated Use SPFN_AUTH_BCRYPT_SALT_ROUNDS instead */
    BCRYPT_SALT_ROUNDS?: number;

    /** @deprecated Use SPFN_AUTH_VERIFICATION_TOKEN_SECRET instead */
    VERIFICATION_TOKEN_SECRET?: string;

    /** @deprecated Use SPFN_AUTH_ADMIN_ACCOUNTS instead */
    ADMIN_ACCOUNTS?: string;

    /** @deprecated Use SPFN_AUTH_ADMIN_EMAILS instead */
    ADMIN_EMAILS?: string;

    /** @deprecated Use SPFN_AUTH_ADMIN_PASSWORDS instead */
    ADMIN_PASSWORDS?: string;

    /** @deprecated Use SPFN_AUTH_ADMIN_ROLES instead */
    ADMIN_ROLES?: string;

    /** @deprecated Use SPFN_AUTH_ADMIN_EMAIL instead */
    ADMIN_EMAIL?: string;

    /** @deprecated Use SPFN_AUTH_ADMIN_PASSWORD instead */
    ADMIN_PASSWORD?: string;
}