/**
 * User Keys Entity
 *
 * Stores public keys for client-key authentication
 * Stored in spfn_auth schema
 */

import { pgSchema, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { id, timestamps, foreignKey } from '@spfn/core/db';
import { users } from '@spfn/user';

import type { KeyMetadata } from '../../shared/types.js';

/**
 * Auth schema namespace
 */
export const spfnAuth = pgSchema('spfn_auth');

/**
 * User authentication keys table
 *
 * @example
 * ```typescript
 * import { userKeys } from '@spfn/auth/server';
 * import { getDb } from '@spfn/core/db';
 *
 * const db = getDb();
 * const keys = await db.select().from(userKeys).where(eq(userKeys.userId, userId));
 * ```
 */
export const userKeys = spfnAuth.table('user_keys', {
	id: id(),

	/** User ID (FK → spfn_core.users) */
	userId: foreignKey('user', () => users.id),

	/** Unique key identifier (UUID) */
	keyId: text('key_id').notNull().unique(),

	/** Public key for signature verification (base64 DER format) */
	publicKey: text('public_key').notNull(),

	/** When this key was revoked (null if active) */
	revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),

	/** Last time this key was used */
	lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),

	/** Metadata (device, IP, etc.) */
	metadata: jsonb('metadata').$type<KeyMetadata>(),

	...timestamps(),
});

export type UserKey = typeof userKeys.$inferSelect;
export type NewUserKey = typeof userKeys.$inferInsert;