import { Type } from '@sinclair/typebox';
import type { User } from './user';
import type { UserProfile } from './user-profile';

/**
 * Account type - Complete user account information
 *
 * Represents a complete user account with both authentication data and profile information
 * Combines User (auth data) + UserProfile (display data)
 */
export interface Account
{
    /** User authentication data */
    user: User;

    /** User profile data (optional - may not exist yet) */
    profile?: UserProfile | null;
}

/**
 * Account schema for API responses
 */
export const AccountSchema = Type.Object({
    user: Type.Any({ description: 'User authentication data' }), // Will be replaced with UserSchema import
    profile: Type.Optional(Type.Union([
        Type.Any(), // Will be replaced with UserProfileSchema
        Type.Null()
    ], { description: 'User profile data' })),
});