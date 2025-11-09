/**
 * @spfn/auth - User Public Keys Entity
 *
 * Stores client-generated public keys for JWT verification
 * Supports key rotation and multi-key management per user
 */

import { text, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { id, foreignKey } from '@spfn/core/db';
import { users } from './users';
import { authSchema } from './schema';

/**
 * User Public Keys Table
 * Each user can have multiple public keys (for rotation)
 */
export const userPublicKeys = authSchema.table(
    'user_public_keys',
    {
        id: id(),

        // User reference
        userId: foreignKey('user', () => users.id),

        // Key identification (client-generated UUID)
        keyId: text('key_id').notNull().unique(),

        // Public key in Base64-encoded DER format (SPKI)
        publicKey: text('public_key').notNull(),

        // Algorithm used (ES256 recommended, RS256 fallback)
        algorithm: text('algorithm', {
            enum: ['ES256', 'RS256']
        }).notNull().default('ES256'),

        // Key fingerprint (SHA-256 hash for quick identification)
        fingerprint: text('fingerprint').notNull(),

        // Key status
        isActive: boolean('is_active').notNull().default(true),

        // Timestamps
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .notNull()
            .defaultNow(),

        lastUsedAt: timestamp('last_used_at', { mode: 'date', withTimezone: true }),

        expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }),

        // Revocation
        revokedAt: timestamp('revoked_at', { mode: 'date', withTimezone: true }),
        revokedReason: text('revoked_reason'),
    },
    (table) => [
        index('user_public_keys_user_id_idx').on(table.userId),
        index('user_public_keys_key_id_idx').on(table.keyId),
        index('user_public_keys_active_idx').on(table.isActive),
        index('user_public_keys_fingerprint_idx').on(table.fingerprint),
    ]
);

export type UserPublicKey = typeof userPublicKeys.$inferSelect;
export type NewUserPublicKey = typeof userPublicKeys.$inferInsert;