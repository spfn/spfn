/**
 * Test Database Setup
 *
 * Sets up and tears down test database for integration tests
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { initDatabase, closeDatabase } from '@spfn/core/db';
import * as schema from '@/server/entities/index';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://authtest:authtest123@localhost:5435/spfn_auth_test';

let testDb: ReturnType<typeof drizzle> | null = null;
let testClient: ReturnType<typeof postgres> | null = null;
let dbAvailable: boolean | null = null;

/**
 * Check if test database is available
 *
 * @returns true if DB is available, false otherwise
 */
export async function isDatabaseAvailable(): Promise<boolean>
{
    if (dbAvailable !== null)
    {
        return dbAvailable;
    }

    try
    {
        const client = postgres(TEST_DATABASE_URL, {
            max: 1,
            connect_timeout: 3, // 3 seconds timeout
        });

        // Try to connect
        await client`SELECT 1`;
        await client.end();

        dbAvailable = true;
        return true;
    }
    catch (error)
    {
        console.log('[Test] ⚠️  Test database not available. Integration tests will be skipped.');
        console.log(`[Test]    Expected database: ${TEST_DATABASE_URL}`);
        console.log(`[Test]    Error: ${(error as Error).message}`);
        dbAvailable = false;
        return false;
    }
}

/**
 * Initialize test database connection
 *
 * @throws Error if database is not available
 */
export async function setupTestDb()
{
    if (testDb)
    {
        return testDb;
    }

    // Check if DB is available first
    const available = await isDatabaseAvailable();
    if (!available)
    {
        throw new Error('Test database not available');
    }

    testClient = postgres(TEST_DATABASE_URL);
    testDb = drizzle(testClient, { schema });

    // Set DATABASE_URL environment variable for @spfn/core/db
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    // Initialize @spfn/core/db with test database
    await initDatabase();

    // Run migrations (create tables)
    await createTables(testDb);

    return testDb;
}

/**
 * Clean up test database
 */
export async function teardownTestDb()
{
    // Close @spfn/core/db instance first
    await closeDatabase();

    if (testDb && testClient)
    {
        await testClient.end();
        testDb = null;
        testClient = null;
    }
}

/**
 * Clear all tables (for test isolation)
 */
export async function clearTables(db: ReturnType<typeof drizzle>)
{
    // Clear in reverse dependency order
    await db.execute(sql`TRUNCATE TABLE spfn_auth.user_permissions CASCADE`);
    await db.execute(sql`TRUNCATE TABLE spfn_auth.role_permissions CASCADE`);
    await db.execute(sql`TRUNCATE TABLE spfn_auth.user_invitations CASCADE`);
    await db.execute(sql`TRUNCATE TABLE spfn_auth.users CASCADE`);
    await db.execute(sql`TRUNCATE TABLE spfn_auth.permissions CASCADE`);
    await db.execute(sql`TRUNCATE TABLE spfn_auth.roles CASCADE`);
    await db.execute(sql`TRUNCATE TABLE spfn_auth.user_public_keys CASCADE`);
    await db.execute(sql`TRUNCATE TABLE spfn_auth.user_social_accounts CASCADE`);
    await db.execute(sql`TRUNCATE TABLE spfn_auth.verification_codes CASCADE`);
}

/**
 * Create tables manually (instead of using drizzle-kit migrations)
 */
async function createTables(db: ReturnType<typeof drizzle>)
{
    // Create schema if not exists
    await db.execute(sql`CREATE SCHEMA IF NOT EXISTS spfn_auth`);

    // Drop existing tables (in reverse dependency order)
    await db.execute(sql`DROP TABLE IF EXISTS spfn_auth.user_permissions CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS spfn_auth.role_permissions CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS spfn_auth.user_invitations CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS spfn_auth.verification_codes CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS spfn_auth.user_public_keys CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS spfn_auth.user_social_accounts CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS spfn_auth.users CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS spfn_auth.permissions CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS spfn_auth.roles CASCADE`);

    // Create roles table
    await db.execute(sql`
        CREATE TABLE spfn_auth.roles (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            description TEXT,
            is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
            is_system BOOLEAN NOT NULL DEFAULT FALSE,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            priority INTEGER NOT NULL DEFAULT 10,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
    `);

    // Create permissions table
    await db.execute(sql`
        CREATE TABLE spfn_auth.permissions (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            description TEXT,
            category TEXT,
            is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
            is_system BOOLEAN NOT NULL DEFAULT FALSE,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
    `);

    // Create users table
    await db.execute(sql`
        CREATE TABLE spfn_auth.users (
            id BIGSERIAL PRIMARY KEY,
            email TEXT UNIQUE,
            phone TEXT UNIQUE,
            password_hash TEXT,
            password_change_required BOOLEAN NOT NULL DEFAULT FALSE,
            role_id BIGINT NOT NULL REFERENCES spfn_auth.roles(id),
            status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
            email_verified_at TIMESTAMP WITH TIME ZONE,
            phone_verified_at TIMESTAMP WITH TIME ZONE,
            last_login_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT email_or_phone_check CHECK (email IS NOT NULL OR phone IS NOT NULL)
        )
    `);

    // Create role_permissions table
    await db.execute(sql`
        CREATE TABLE spfn_auth.role_permissions (
            id BIGSERIAL PRIMARY KEY,
            role_id BIGINT NOT NULL REFERENCES spfn_auth.roles(id) ON DELETE CASCADE,
            permission_id BIGINT NOT NULL REFERENCES spfn_auth.permissions(id) ON DELETE CASCADE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            UNIQUE(role_id, permission_id)
        )
    `);

    // Create user_permissions table
    await db.execute(sql`
        CREATE TABLE spfn_auth.user_permissions (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES spfn_auth.users(id) ON DELETE CASCADE,
            permission_id BIGINT NOT NULL REFERENCES spfn_auth.permissions(id) ON DELETE CASCADE,
            granted BOOLEAN NOT NULL DEFAULT TRUE,
            reason TEXT,
            expires_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            UNIQUE(user_id, permission_id)
        )
    `);

    // Create user_public_keys table
    await db.execute(sql`
        CREATE TABLE spfn_auth.user_public_keys (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES spfn_auth.users(id) ON DELETE CASCADE,
            key_id TEXT NOT NULL UNIQUE,
            public_key TEXT NOT NULL,
            algorithm TEXT NOT NULL DEFAULT 'ES256' CHECK (algorithm IN ('ES256', 'RS256')),
            fingerprint TEXT NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            last_used_at TIMESTAMP WITH TIME ZONE,
            expires_at TIMESTAMP WITH TIME ZONE,
            revoked_at TIMESTAMP WITH TIME ZONE,
            revoked_reason TEXT
        )
    `);

    // Create user_social_accounts table
    await db.execute(sql`
        CREATE TABLE spfn_auth.user_social_accounts (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES spfn_auth.users(id) ON DELETE CASCADE,
            provider TEXT NOT NULL CHECK (provider IN ('google', 'github', 'kakao', 'naver')),
            provider_user_id TEXT NOT NULL,
            provider_email TEXT,
            access_token TEXT,
            refresh_token TEXT,
            token_expires_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
    `);

    // Create unique index on provider + provider_user_id
    await db.execute(sql`
        CREATE UNIQUE INDEX provider_user_unique_idx
        ON spfn_auth.user_social_accounts(provider, provider_user_id)
    `);

    // Create verification_codes table
    await db.execute(sql`
        CREATE TABLE spfn_auth.verification_codes (
            id BIGSERIAL PRIMARY KEY,
            target TEXT NOT NULL,
            target_type TEXT NOT NULL CHECK (target_type IN ('email', 'phone')),
            code TEXT NOT NULL,
            purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'login', 'password_reset', 'email_change', 'phone_change')),
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            used_at TIMESTAMP WITH TIME ZONE,
            attempts TEXT NOT NULL DEFAULT '0',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
    `);

    // Create index on target + purpose + expires_at
    await db.execute(sql`
        CREATE INDEX target_purpose_idx
        ON spfn_auth.verification_codes(target, purpose, expires_at)
    `);

    // Create user_invitations table
    await db.execute(sql`
        CREATE TABLE spfn_auth.user_invitations (
            id BIGSERIAL PRIMARY KEY,
            email TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            role_id BIGINT NOT NULL REFERENCES spfn_auth.roles(id),
            invited_by BIGINT NOT NULL REFERENCES spfn_auth.users(id),
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            accepted_at TIMESTAMP WITH TIME ZONE,
            cancelled_at TIMESTAMP WITH TIME ZONE,
            metadata JSONB,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
    `);

    // Create indexes for user_invitations
    await db.execute(sql`CREATE INDEX invitations_token_idx ON spfn_auth.user_invitations(token)`);
    await db.execute(sql`CREATE INDEX invitations_email_idx ON spfn_auth.user_invitations(email)`);
    await db.execute(sql`CREATE INDEX invitations_status_idx ON spfn_auth.user_invitations(status)`);
    await db.execute(sql`CREATE INDEX invitations_invited_by_idx ON spfn_auth.user_invitations(invited_by)`);
    await db.execute(sql`CREATE INDEX invitations_expires_at_idx ON spfn_auth.user_invitations(expires_at)`);
    await db.execute(sql`CREATE INDEX invitations_role_id_idx ON spfn_auth.user_invitations(role_id)`);
}

/**
 * Get test database instance
 */
export function getTestDb()
{
    if (!testDb)
    {
        throw new Error('Test database not initialized. Call setupTestDb() first.');
    }
    return testDb;
}