/**
 * User Profile types for API responses
 *
 * Public user profile - suitable for API responses
 * Does NOT expose internal DB structure directly
 */

import { Type } from '@sinclair/typebox';

/**
 * Public User Profile type for API responses
 *
 * Represents user profile information suitable for client consumption
 * Separate from authentication data in User type
 */
export interface UserProfile
{
    /** Profile ID */
    profileId: string;

    /** User ID this profile belongs to */
    userId: string;

    /** Display name (required) */
    displayName: string;

    /** First name (optional) */
    firstName?: string | null;

    /** Last name (optional) */
    lastName?: string | null;

    /** Avatar URL (optional) */
    avatarUrl?: string | null;

    /** Bio/description (optional) */
    bio?: string | null;

    /** Locale preference */
    locale: string;

    /** Timezone preference */
    timezone: string;

    /** Date of birth (optional, YYYY-MM-DD) */
    dateOfBirth?: string | null;

    /** Gender (optional) */
    gender?: string | null;

    /** Website URL (optional) */
    website?: string | null;

    /** Location (optional) */
    location?: string | null;

    /** Company name (optional) */
    company?: string | null;

    /** Job title (optional) */
    jobTitle?: string | null;

    /** Profile creation timestamp (ISO 8601) */
    createdAt: string;

    /** Profile last update timestamp (ISO 8601) */
    updatedAt: string;
}

/**
 * User Profile schema for API responses
 */
export const UserProfileSchema = Type.Object({
    profileId: Type.String({ description: 'Profile ID' }),
    userId: Type.String({ description: 'User ID' }),
    displayName: Type.String({ description: 'Display name' }),
    firstName: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: 'First name' })),
    lastName: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: 'Last name' })),
    avatarUrl: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: 'Avatar URL' })),
    bio: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: 'Bio' })),
    locale: Type.String({ description: 'Locale preference', default: 'en' }),
    timezone: Type.String({ description: 'Timezone preference', default: 'UTC' }),
    dateOfBirth: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: 'Date of birth (YYYY-MM-DD)' })),
    gender: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: 'Gender' })),
    website: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: 'Website URL' })),
    location: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: 'Location' })),
    company: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: 'Company' })),
    jobTitle: Type.Optional(Type.Union([Type.String(), Type.Null()], { description: 'Job title' })),
    createdAt: Type.String({ description: 'Profile creation timestamp' }),
    updatedAt: Type.String({ description: 'Profile last update timestamp' }),
});