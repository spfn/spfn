/**
 * @spfn/auth - Profile Base Schema
 *
 * Common profile field schemas
 */

import { Type } from '@sinclair/typebox';
import { Nullable } from "@spfn/core/route/types";

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
        firstName: Nullable(Type.String({
            description: 'First name'
        })),
        lastName: Nullable(Type.String({
            description: 'Last name'
        })),
        avatarUrl: Nullable(Type.String({
            description: 'Avatar URL'
        })),
        bio: Nullable(Type.String({
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
        website: Nullable(Type.String({
            description: 'Website URL'
        })),
        location: Nullable(Type.String({
            description: 'Location'
        })),
        company: Nullable(Type.String({
            description: 'Company name'
        })),
        jobTitle: Nullable(Type.String({
            description: 'Job title'
        })),
        createdAt: Type.Date({
            description: 'Profile creation timestamp (ISO 8601)',
            format: 'date-time'
        }),
        updatedAt: Type.Date({
            description: 'Last update timestamp (ISO 8601)',
            format: 'date-time'
        }),
    }
);