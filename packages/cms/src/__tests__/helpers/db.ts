/**
 * Test Database Setup
 *
 * Sets up and tears down test database for integration tests
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { initDatabase, closeDatabase } from '@spfn/core/db';
import * as schema from '@/server/entities/config';

const TEST_DATABASE_URL = 'postgresql://cmstest:cmstest123@localhost:5436/spfn_cms_test';

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
    await db.execute(sql`TRUNCATE TABLE spfn_cms.labels CASCADE`);
    await db.execute(sql`TRUNCATE TABLE spfn_cms.label_versions CASCADE`);
    await db.execute(sql`TRUNCATE TABLE spfn_cms.label_values CASCADE`);
    await db.execute(sql`TRUNCATE TABLE spfn_cms.draft_cache CASCADE`);
    await db.execute(sql`TRUNCATE TABLE spfn_cms.published_cache CASCADE`);
    await db.execute(sql`TRUNCATE TABLE spfn_cms.audit_logs CASCADE`);
}

/**
 * Create tables manually (instead of using drizzle-kit migrations)
 */
async function createTables(db: ReturnType<typeof drizzle>)
{
    // Create schema if not exists
    await db.execute(sql`CREATE SCHEMA IF NOT EXISTS spfn_cms`);

    // Drop existing tables (reverse order due to foreign keys)
    await db.execute(sql`DROP TABLE IF EXISTS spfn_cms.audit_logs CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS spfn_cms.published_cache CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS spfn_cms.draft_cache CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS spfn_cms.label_values CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS spfn_cms.label_versions CASCADE`);
    await db.execute(sql`DROP TABLE IF EXISTS spfn_cms.labels CASCADE`);

    // Create labels table
    await db.execute(sql`
        CREATE TABLE spfn_cms.labels (
            id SERIAL PRIMARY KEY,
            key TEXT NOT NULL UNIQUE,
            section TEXT NOT NULL,
            type TEXT NOT NULL,
            default_value TEXT,
            description TEXT,
            published_version INTEGER,
            created_by TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
    `);

    // Create indexes for labels
    await db.execute(sql`
        CREATE INDEX cms_labels_section_idx ON spfn_cms.labels(section)
    `);
    await db.execute(sql`
        CREATE INDEX cms_labels_key_idx ON spfn_cms.labels(key)
    `);

    // Create label_versions table
    await db.execute(sql`
        CREATE TABLE spfn_cms.label_versions (
            id SERIAL PRIMARY KEY,
            label_id INTEGER NOT NULL REFERENCES spfn_cms.labels(id) ON DELETE CASCADE,
            version INTEGER NOT NULL,
            status TEXT NOT NULL,
            published_at TIMESTAMP WITH TIME ZONE,
            published_by TEXT,
            notes TEXT,
            created_by TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT cms_label_versions_label_version_unique UNIQUE (label_id, version)
        )
    `);

    // Create indexes for label_versions
    await db.execute(sql`
        CREATE INDEX cms_label_versions_label_id_idx ON spfn_cms.label_versions(label_id)
    `);
    await db.execute(sql`
        CREATE INDEX cms_label_versions_status_idx ON spfn_cms.label_versions(status)
    `);

    // Create label_values table
    await db.execute(sql`
        CREATE TABLE spfn_cms.label_values (
            id SERIAL PRIMARY KEY,
            label_id INTEGER NOT NULL REFERENCES spfn_cms.labels(id) ON DELETE CASCADE,
            version INTEGER NOT NULL DEFAULT 1,
            locale TEXT NOT NULL DEFAULT 'ko',
            breakpoint TEXT,
            value JSONB NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT cms_label_values_locale_breakpoint_unique UNIQUE (label_id, version, locale, breakpoint)
        )
    `);

    // Create indexes for label_values
    await db.execute(sql`
        CREATE INDEX cms_label_values_label_version_idx ON spfn_cms.label_values(label_id, version)
    `);
    await db.execute(sql`
        CREATE INDEX cms_label_values_locale_idx ON spfn_cms.label_values(locale)
    `);

    // Create draft_cache table
    await db.execute(sql`
        CREATE TABLE spfn_cms.draft_cache (
            id SERIAL PRIMARY KEY,
            section TEXT NOT NULL,
            locale TEXT NOT NULL,
            user_id TEXT NOT NULL,
            content JSONB NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT cms_draft_cache_unique UNIQUE (section, locale, user_id)
        )
    `);

    // Create indexes for draft_cache
    await db.execute(sql`
        CREATE INDEX cms_draft_cache_section_idx ON spfn_cms.draft_cache(section)
    `);
    await db.execute(sql`
        CREATE INDEX cms_draft_cache_user_idx ON spfn_cms.draft_cache(user_id)
    `);

    // Create published_cache table
    await db.execute(sql`
        CREATE TABLE spfn_cms.published_cache (
            id SERIAL PRIMARY KEY,
            section TEXT NOT NULL,
            locale TEXT NOT NULL,
            content JSONB NOT NULL,
            published_at TIMESTAMP WITH TIME ZONE NOT NULL,
            published_by TEXT,
            version INTEGER NOT NULL DEFAULT 1,
            CONSTRAINT cms_published_cache_unique UNIQUE (section, locale)
        )
    `);

    // Create index for published_cache
    await db.execute(sql`
        CREATE INDEX cms_published_cache_section_idx ON spfn_cms.published_cache(section)
    `);

    // Create audit_logs table
    await db.execute(sql`
        CREATE TABLE spfn_cms.audit_logs (
            id SERIAL PRIMARY KEY,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id INTEGER,
            changes JSONB,
            performed_by TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
    `);

    // Create indexes for audit_logs
    await db.execute(sql`
        CREATE INDEX cms_audit_logs_entity_idx ON spfn_cms.audit_logs(entity_type, entity_id)
    `);
    await db.execute(sql`
        CREATE INDEX cms_audit_logs_created_at_idx ON spfn_cms.audit_logs(created_at)
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