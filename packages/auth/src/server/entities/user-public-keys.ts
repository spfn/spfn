/**
 * @spfn/auth - User Public Keys Entity
 *
 * Stores client-generated public keys for JWT verification
 * Supports key rotation and multi-key management per user
 */

import { KEY_ALGORITHM } from '../types';
import { text, boolean, index } from 'drizzle-orm/pg-core';
import { id, foreignKey, enumText, utcTimestamp } from '@spfn/core/db';
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
        // Foreign key to users table
        // Used for: associating keys with user accounts
        userId: foreignKey('user', () => users.id),

        // Key identification
        // Client-generated UUID (v4 recommended)
        // Used in: JWT header 'kid' field for key lookup
        // Must be unique across all users
        keyId: text('key_id').notNull().unique(),

        // Public key material
        // Format: Base64-encoded DER (SPKI) format
        // Standards: RFC 5480 (EC), RFC 3447 (RSA)
        // Used for: JWT signature verification
        publicKey: text('public_key').notNull(),

        // Signature algorithm
        // ES256: ECDSA with P-256 and SHA-256 (recommended, smaller keys)
        // RS256: RSA with SHA-256 (fallback, larger keys)
        algorithm: enumText('algorithm', KEY_ALGORITHM).notNull().default('ES256'),

        // Key fingerprint
        // SHA-256 hash of the public key for quick identification
        // Format: hex-encoded string (64 chars)
        // Used for: duplicate detection, key verification
        fingerprint: text('fingerprint').notNull(),

        // Key status
        // false: Key is deactivated (cannot be used for verification)
        // Used for: soft key rotation, temporary key suspension
        isActive: boolean('is_active').notNull().default(true),

        // Key creation timestamp
        // Automatically set on insertion
        createdAt: utcTimestamp('created_at').notNull().defaultNow(),

        // Last usage timestamp
        // Updated each time key is used for JWT verification
        // Used for: tracking key activity, identifying unused keys
        lastUsedAt: utcTimestamp('last_used_at'),

        // Key expiration timestamp (optional)
        // null: Key does not expire
        // timestamp: Key cannot be used after this time
        // Used for: automatic key rotation, security compliance
        expiresAt: utcTimestamp('expires_at'),

        // Key revocation timestamp
        // null: Key is not revoked
        // timestamp: Key was revoked at this time
        // Used for: security incidents, key compromise
        revokedAt: utcTimestamp('revoked_at'),

        // Revocation reason
        // Human-readable explanation for key revocation
        // Example: "Key compromised", "User reported device lost"
        revokedReason: text('revoked_reason'),
    },
    (table) => [
        index('user_public_keys_user_id_idx').on(table.userId),
        index('user_public_keys_key_id_idx').on(table.keyId),
        index('user_public_keys_active_idx').on(table.isActive),
        index('user_public_keys_fingerprint_idx').on(table.fingerprint),
    ],
);

export type UserPublicKey = typeof userPublicKeys.$inferSelect;
export type NewUserPublicKey = typeof userPublicKeys.$inferInsert;
