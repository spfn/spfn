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
    metadata: Record<string, any> | null;
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
    username: string | null;
    emailVerified: boolean;
    phoneVerified: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    profile: ProfileInfo | null;
}