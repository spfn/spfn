/**
 * @spfn/auth - User Profile Routes
 */

import { getAuth } from '../../helpers';
import { getUserProfileService, updateUserProfileService } from '../../services';
import { defineRouter, route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

/**
 * GET /_auth/users/profile
 * Get user profile (authenticated)
 *
 * Returns complete user profile information including:
 * - User basic info (id, email, verification status, timestamps)
 * - Profile data (optional)
 *
 * Does not include role and permissions
 * Use /_auth/session for authentication/authorization data
 *
 * Requires authentication
 */
export const getUserProfile = route.get('/_auth/users/profile')
    .handler(async (c) =>
    {
        const { userId } = getAuth(c);
        return await getUserProfileService(userId);
    });

/**
 * PATCH /_auth/users/profile
 * Update user profile (authenticated)
 *
 * Creates profile if not exists (upsert)
 * Empty string values are saved as null
 *
 * Requires authentication
 */
export const updateUserProfile = route.patch('/_auth/users/profile')
    .input({
        body: Type.Object({
            displayName: Type.Optional(Type.String({ description: 'Display name shown in UI' })),
            firstName: Type.Optional(Type.String({ description: 'First name' })),
            lastName: Type.Optional(Type.String({ description: 'Last name' })),
            avatarUrl: Type.Optional(Type.String({ description: 'Avatar/profile picture URL' })),
            bio: Type.Optional(Type.String({ description: 'Short bio/description' })),
            locale: Type.Optional(Type.String({ description: 'Locale/language preference (e.g., en, ko)' })),
            timezone: Type.Optional(Type.String({ description: 'Timezone (e.g., Asia/Seoul)' })),
            dateOfBirth: Type.Optional(Type.String({ description: 'Date of birth (YYYY-MM-DD)' })),
            gender: Type.Optional(Type.String({ description: 'Gender' })),
            website: Type.Optional(Type.String({ description: 'Personal or professional website' })),
            location: Type.Optional(Type.String({ description: 'Location (city, country, etc.)' })),
            company: Type.Optional(Type.String({ description: 'Company name' })),
            jobTitle: Type.Optional(Type.String({ description: 'Job title' })),
            metadata: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: 'Additional metadata' })),
        })
    })
    .handler(async (c) =>
    {
        const { userId } = getAuth(c);
        const { body } = await c.data();
        return await updateUserProfileService(userId, body);
    });

// Export router
export const userRouter = defineRouter({
    getUserProfile: getUserProfile,
    updateUserProfile: updateUserProfile,
});

// For backward compatibility with file-based routing (temporary)
export default userRouter;