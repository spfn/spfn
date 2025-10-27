/**
 * Test Database Setup
 *
 * Sets up and tears down test database for integration tests
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { initDatabase } from '@spfn/core/db';
import * as schema from '../../entities/index.js';

const TEST_DATABASE_URL = 'postgresql://authtest:authtest123@localhost:5435/spfn_auth_test';

let testDb: ReturnType<typeof drizzle> | null = null;
let testClient: ReturnType<typeof postgres> | null = null;

/**
 * Initialize test database connection
 */
export async function setupTestDb()
{
    if (testDb)
    {
        return testDb;
    }

    testClient = postgres(TEST_DATABASE_URL);
    testDb = drizzle(testClient, { schema });

    // Initialize @spfn/core/db with test database
    await initDatabase(
        {
            url: TEST_DATABASE_URL,
        }
    );

    // Run migrations (create tables)
    await createTables(testDb);

    return testDb;
}

/**
 * Clean up test database
 */
export async function teardownTestDb()
{
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
    await db.execute(sql`TRUNCATE TABLE spfn_auth.users CASCADE`);
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

    // Drop existing tables
    await db.execute(sql`DROP TABLE IF EXISTS spfn_auth.verification_codes CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS spfn_auth.user_social_accounts CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS spfn_auth.users CASCADE`);

    // Create users table
    await db.execute(sql`
        CREATE TABLE spfn_auth.users (
            id BIGSERIAL PRIMARY KEY,
            email TEXT UNIQUE,
            phone TEXT UNIQUE,
            password_hash TEXT,
            role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('superadmin', 'admin', 'user')),
            status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
            email_verified_at TIMESTAMP WITH TIME ZONE,
            phone_verified_at TIMESTAMP WITH TIME ZONE,
            last_login_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT email_or_phone_check CHECK (email IS NOT NULL OR phone IS NOT NULL)
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