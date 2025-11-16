/**
 * @spfn/auth - User Profile Response Schema
 *
 * Schema for user profile API response
 * Returns full user info with profile data
 */

import { Type, Static } from '@sinclair/typebox';
import { Nullable } from "@spfn/core/route/types";
import { FullUserInfoSchema } from './base/user-base';
import { ProfileInfoSchema } from './base/profile-base';

/**
 * User Profile Response Schema
 *
 * Complete user data including:
 * - User fields at top level (userId, email, etc.)
 * - Profile data as nested field (optional)
 *
 * Excludes:
 * - Role and permissions (use auth session API)
 */
export const UserProfileResponseSchema = Type.Object(
    {
        ...FullUserInfoSchema.properties,
        profile: Nullable(ProfileInfoSchema),
    }
);

export type UserProfileResponse = Static<typeof UserProfileResponseSchema>;