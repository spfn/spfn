/**
 * @spfn/auth - User Profile Public Schema
 *
 * TypeBox schema for publicly accessible user profile fields
 * Excludes sensitive information like dateOfBirth, gender
 */

import { Type, Static } from '@sinclair/typebox';

/**
 * Public User Profile Schema
 *
 * Contains safe-to-expose profile fields:
 * - Display information (name, avatar, bio)
 * - Preferences (locale, timezone)
 * - Professional info (company, jobTitle)
 * - Social links (website, location)
 *
 * Excludes sensitive fields:
 * - dateOfBirth, gender
 */
export const PublicUserProfileSchema = Type.Object(
    {
        id: Type.Number({
            description: 'Profile ID'
        }),
        userId: Type.Number({
            description: 'User ID (foreign key)'
        }),
        displayName: Type.String({
            description: 'Display name shown in UI'
        }),
        firstName: Type.Optional(Type.String({
            description: 'First name'
        })),
        lastName: Type.Optional(Type.String({
            description: 'Last name'
        })),
        avatarUrl: Type.Optional(Type.String({
            description: 'Profile picture URL'
        })),
        bio: Type.Optional(Type.String({
            description: 'Short bio/description'
        })),
        locale: Type.String({
            description: 'Language preference (e.g., en, ko, ja)',
            default: 'en'
        }),
        timezone: Type.String({
            description: 'Timezone (e.g., Asia/Seoul, UTC)',
            default: 'UTC'
        }),
        website: Type.Optional(Type.String({
            description: 'Personal or professional website'
        })),
        location: Type.Optional(Type.String({
            description: 'Location (city, country, etc.)'
        })),
        company: Type.Optional(Type.String({
            description: 'Company name'
        })),
        jobTitle: Type.Optional(Type.String({
            description: 'Job title'
        })),
        createdAt: Type.String({
            description: 'Profile creation timestamp (ISO 8601)',
            format: 'date-time'
        }),
        updatedAt: Type.String({
            description: 'Last update timestamp (ISO 8601)',
            format: 'date-time'
        }),
    }
);

export type PublicUserProfile = Static<typeof PublicUserProfileSchema>;