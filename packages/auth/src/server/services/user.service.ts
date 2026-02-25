/**
 * @spfn/auth - User Service
 *
 * Handles user CRUD operations
 */

import { type NewUser } from "../entities/users";
import { usersRepository } from '../repositories';
import { UsernameAlreadyTakenError } from '@spfn/auth/errors';

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

/**
 * Check if username is available
 *
 * @returns true if the username is available
 */
export async function checkUsernameAvailableService(username: string)
{
    const existing = await usersRepository.findByUsername(username);
    return !existing;
}

/**
 * Update username with duplicate check
 *
 * @param userId - User ID (string, number, or bigint)
 * @param username - New username or null to clear
 * @throws UsernameAlreadyTakenError if username is already in use by another user
 */
export async function updateUsernameService(userId: string | number | bigint, username: string | null)
{
    const userIdNum = typeof userId === 'string' ? Number(userId) : Number(userId);

    if (username !== null)
    {
        const existing = await usersRepository.findByUsername(username);

        if (existing && existing.id !== userIdNum)
        {
            throw new UsernameAlreadyTakenError({ username });
        }
    }

    return await usersRepository.updateById(userIdNum, { username });
}