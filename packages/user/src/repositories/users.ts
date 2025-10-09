/**
 * Users Repository
 *
 * CRUD operations for users table
 */

import { eq } from 'drizzle-orm';
import { Repository } from '@spfn/core/db';

import { users } from '../entities';
import type { User, NewUser, UserState } from '../entities';

/**
 * Users Repository
 *
 * Extends Repository pattern from @spfn/core/db
 *
 * @example
 * ```typescript
 * import { getDb } from '@spfn/core/db';
 * import { UsersRepository, users } from '@spfn/user';
 *
 * const usersRepo = new UsersRepository(getDb(), users);
 * const user = await usersRepo.findByEmail('user@example.com');
 * ```
 */
export class UsersRepository extends Repository<typeof users>
{
	/**
	 * Find user by email (case-insensitive)
	 */
	async findByEmail(email: string): Promise<User | null>
	{
		return this.findOne(eq(this.table.email, email));
	}

	/**
	 * Find user by mobile number
	 */
	async findByMobileNumber(mobileNumber: string): Promise<User | null>
	{
		return this.findOne(eq(this.table.mobileNumber, mobileNumber));
	}

	/**
	 * Find user by username
	 */
	async findByUsername(username: string): Promise<User | null>
	{
		return this.findOne(eq(this.table.username, username));
	}

	/**
	 * Find user by ID
	 */
	async findById(id: number): Promise<User | null>
	{
		return this.findOne(eq(this.table.id, id));
	}

	/**
	 * Create new user
	 */
	async createUser(data: NewUser): Promise<User>
	{
		return this.save(data);
	}

	/**
	 * Update user
	 */
	async updateUser(id: number, data: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>): Promise<User | null>
	{
		return this.update(id, data);
	}

	/**
	 * Delete user (hard delete)
	 */
	async deleteUser(id: number): Promise<void>
	{
		await this.delete(id);
	}

	/**
	 * Update user password
	 */
	async updatePassword(id: number, password: string): Promise<User | null>
	{
		return this.update(id, { password });
	}

	/**
	 * Update user state (ACTIVE, BLOCKED, WITHDRAWN)
	 */
	async updateState(id: number, state: UserState): Promise<User | null>
	{
		return this.update(id, { state });
	}

	/**
	 * Check if email is already taken
	 */
	async isEmailTaken(email: string): Promise<boolean>
	{
		const user = await this.findByEmail(email);
		return !!user;
	}

	/**
	 * Check if mobile number is already taken
	 */
	async isMobileNumberTaken(mobileNumber: string): Promise<boolean>
	{
		const user = await this.findByMobileNumber(mobileNumber);
		return !!user;
	}

	/**
	 * Check if username is already taken
	 */
	async isUsernameTaken(username: string): Promise<boolean>
	{
		const user = await this.findByUsername(username);
		return !!user;
	}
}