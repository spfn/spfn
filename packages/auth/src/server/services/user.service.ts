/**
 * @spfn/auth - User Service
 *
 * Handles user CRUD operations
 */

import { type NewUser } from "@/server/entities/users";
import { usersRepository } from '@/server/repositories';

/**
 * Get user by ID
 */
export async function getUserByIdService(userId: number)
{
    return await usersRepository.findById(userId);
}

/**
 * Get user by email
 */
export async function getUserByEmailService(email: string)
{
    return await usersRepository.findByEmail(email);
}

/**
 * Get user by phone
 */
export async function getUserByPhoneService(phone: string)
{
    return await usersRepository.findByPhone(phone);
}

/**
 * Update user's last login timestamp
 */
export async function updateLastLoginService(userId: number)
{
    await usersRepository.updateLastLogin(userId);
}

/**
 * Update user data
 */
export async function updateUserService(
    userId: number,
    updates: Partial<NewUser>
): Promise<void>
{
    await usersRepository.updateById(userId, updates);
}