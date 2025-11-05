/**
 * @spfn/auth - User Service
 *
 * Handles user CRUD operations
 */

import { findOne, updateOne } from '@spfn/core/db';
import { users, type User } from '@/server/entities';

/**
 * Get user by ID
 */
export async function getUserByIdService(userId: number): Promise<User | null>
{
    return await findOne(users, { id: userId });
}

/**
 * Get user by email
 */
export async function getUserByEmailService(email: string): Promise<User | null>
{
    return await findOne(users, { email });
}

/**
 * Get user by phone
 */
export async function getUserByPhoneService(phone: string): Promise<User | null>
{
    return await findOne(users, { phone });
}

/**
 * Update user's last login timestamp
 */
export async function updateLastLoginService(userId: number): Promise<void>
{
    await updateOne(users, { id: userId }, {
        lastLoginAt: new Date(),
    });
}

/**
 * Update user data
 */
export async function updateUserService(
    userId: number,
    updates: Partial<Omit<User, 'id' | 'createdAt'>>
): Promise<void>
{
    await updateOne(users, { id: userId }, {
        ...updates,
        updatedAt: new Date(),
    });
}