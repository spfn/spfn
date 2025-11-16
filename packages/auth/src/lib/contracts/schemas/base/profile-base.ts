/**
 * @spfn/auth - Profile Base Schema
 *
 * Common profile field schemas
 */

import { Type } from '@sinclair/typebox';

/**
 * User Profile Schema
 * Contains all public profile information
 */
export const ProfileInfoSchema = Type.Object(
    {
        profileId: Type.Number({
            description: 'Profile ID'
        }),
        displayName: Type.String({
            description: 'Display name'
        }),
        firstName: Type.Optional(Type.String({
            description: 'First name'
        })),
        lastName: Type.Optional(Type.String({
            description: 'Last name'
        })),
        avatarUrl: Type.Optional(Type.String({
            description: 'Avatar URL'
        })),
        bio: Type.Optional(Type.String({
            description: 'Bio/description'
        })),
        locale: Type.String({
            description: 'Language preference',
            default: 'en'
        }),
        timezone: Type.String({
            description: 'Timezone',
            default: 'UTC'
        }),
        website: Type.Optional(Type.String({
            description: 'Website URL'
        })),
        location: Type.Optional(Type.String({
            description: 'Location'
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