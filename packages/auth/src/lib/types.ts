/**
 * Role information for client/API responses
 */
export interface Role
{
    id: number;
    name: string;
    displayName: string;
    description: string | null;
    isBuiltin: boolean;
    isSystem: boolean;
    isActive: boolean;
    priority: number;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Permission information for client/API responses
 */
export interface Permission
{
    id: number;
    name: string;
    displayName: string;
    description: string | null;
    category: string | null;
    isBuiltin: boolean;
    isSystem: boolean;
    isActive: boolean;
    metadata: Record<string, any> | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface AuthSession
{
    userId: number;
    email: string | null;
    emailVerified: boolean;
    phoneVerified: boolean;
    role: Role;
    permissions: Permission[];
}

export interface ProfileInfo
{
    profileId: number;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    bio: string | null;
    locale: string;
    timezone: string;
    website: string | null;
    location: string | null;
    company: string | null;
    jobTitle: string | null;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * User Profile Response
 *
 * Complete user data including:
 * - User fields at top level (userId, email, etc.)
 * - Profile data as nested field (optional)
 *
 * Excludes:
 * - Role and permissions (use auth session API)
 */
export interface UserProfile
{
    userId: number;
    email: string | null;
    emailVerified: boolean;
    phoneVerified: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    profile: ProfileInfo | null;
}

/**
 * Email regex pattern (RFC 5322 compliant)
 * Validates: local-part@domain.tld
 * - Local part: alphanumeric, dots, hyphens, underscores
 * - Domain: alphanumeric, hyphens, dots
 * - TLD: minimum 2 characters
 */
export const EMAIL_PATTERN = '^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$';

/**
 * Phone regex pattern (E.164 format)
 * Format: +[country code][number] (1-15 digits total)
 */
export const PHONE_PATTERN = '^\\+[1-9]\\d{1,14}$';

/**
 * SHA-256 fingerprint pattern (64 hex characters)
 */
export const FINGERPRINT_PATTERN = '^[a-f0-9]{64}$';

/**
 * UUID v4 pattern (8-4-4-4-12 format)
 */
export const UUID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

/**
 * Base64 pattern (DER encoded keys)
 * Matches standard Base64 with padding
 */
export const BASE64_PATTERN = '^[A-Za-z0-9+/]+=*$';