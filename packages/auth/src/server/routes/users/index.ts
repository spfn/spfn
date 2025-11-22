/**
 * @spfn/auth - User Profile Routes
 */

import { getAuth } from '@/server/helpers';
import { getUserProfileService } from '@/server/services/user-profile.service';
import { defineRouter, route } from '@spfn/core/route';

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

// Export router
export const userRouter = defineRouter({
    getUserProfile: getUserProfile,
});

// For backward compatibility with file-based routing (temporary)
export default userRouter;