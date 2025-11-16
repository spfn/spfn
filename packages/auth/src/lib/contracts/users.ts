/**
 * @spfn/auth - Users API Contracts
 *
 * Type-safe API contracts for user profile operations
 */

import { UserProfileResponseSchema } from "@/lib/contracts/schemas/user-profile-response";
import { ApiResponseSchema, defineContract } from '@spfn/core/route/types';

/**
 * GET /profile - Get user profile
 *
 * Returns complete user profile information including:
 * - User basic info (id, email, verification status, timestamps)
 * - Profile data (optional)
 *
 * Does not include role and permissions
 * Use /_auth/session for authentication/authorization data
 *
 * Requires authentication
 * Final path: /users/profile (prefix added from package.json)
 */
export const getUserProfileContract = defineContract({
    method: 'GET',
    path: '/_auth/users/profile',
    response: ApiResponseSchema(UserProfileResponseSchema),
});