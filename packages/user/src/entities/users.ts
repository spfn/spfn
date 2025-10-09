/**
 * Users Entity
 *
 * Stores basic account information of users
 * Schema: spfn_core
 */

import { pgSchema, text, index } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';

/**
 * Core schema namespace
 */
export const spfnCore = pgSchema('spfn_core');

/**
 * User account state
 */
export const UserState = {
	ACTIVE: 'ACTIVE',
	BLOCKED: 'BLOCKED',
	WITHDRAWN: 'WITHDRAWN',
} as const;

export type UserState = typeof UserState[keyof typeof UserState];

/**
 * Users table
 *
 * @example
 * ```typescript
 * import { users } from '@spfn/user';
 * import { getDb } from '@spfn/core/db';
 *
 * const db = getDb();
 * const user = await db.select().from(users).where(eq(users.email, email));
 * ```
 */
export const users = spfnCore.table('users', {
	/** Primary Key (auto-incremented ID) */
	id: id(),

	/** Unique email address used for login (case-insensitive) */
	email: text('email').unique(),

	/** Mobile phone number of the user */
	mobileNumber: text('mobile_number').unique(),

	/** Hashed password (bcrypt) */
	password: text('password'),

	/** Account state (ACTIVE, BLOCKED, WITHDRAWN) */
	state: text('state').$type<UserState>().default(UserState.ACTIVE).notNull(),

	/** Optional unique username chosen by the user */
	username: text('username').unique(),

	/** Record creation timestamp */
	...timestamps(),
}, (table) => ({
	/** Index to optimize searches by creation date */
	createdAtIdx: index('idx_users_created_at').on(table.createdAt),

	/** Composite index for filtering users by state and creation date */
	stateCreatedAtIdx: index('idx_users_state_created_at').on(table.state, table.createdAt),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;