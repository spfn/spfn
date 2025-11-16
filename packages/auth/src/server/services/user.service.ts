/**
 * @spfn/auth - User Service
 *
 * Handles user CRUD operations
 */

import { type User } from '@/server/entities';
import { usersRepository } from '@/server/repositories';

/**
 * Get user by ID
 */
export async function getUserByIdService(userId: number): Promise<User | null>
{
    return await usersRepository.findById(userId);
}

/**
 * Get user by email
 */
export async function getUserByEmailService(email: string): Promise<User | null>
{
    return await usersRepository.findByEmail(email);
}

/**
 * Get user by phone
 */
export async function getUserByPhoneService(phone: string): Promise<User | null>
{
    return await usersRepository.findByPhone(phone);
}

/**
 * Update user's last login timestamp
 */
export async function updateLastLoginService(userId: number): Promise<void>
{
    await usersRepository.updateLastLogin(userId);
}

/**
 * Update user data
 */
export async function updateUserService(
    userId: number,
    updates: Partial<Omit<User, 'id' | 'createdAt'>>
): Promise<void>
{
    await usersRepository.updateById(userId, updates);
}