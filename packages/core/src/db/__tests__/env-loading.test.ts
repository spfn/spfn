/**
 * Environment Variable Loading Tests
 *
 * Test .env.local loading behavior similar to aena project scenario
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { initDatabase, closeDatabase, getDatabase } from '../manager';
import { getRepository } from '../repository';
import { pgTable, text, bigint } from 'drizzle-orm/pg-core';
import { id, timestamps } from '../schema/helpers';

// Test table schema (similar to aena's files table)
const testFiles = pgTable('test_files', {
    id: id(),
    filename: text('filename').notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    ...timestamps(),
});

describe('Environment Variable Loading (.env.local)', () =>
{
    const TEST_DATABASE_URL = process.env.DATABASE_URL;
    const ENV_LOCAL_PATH = join(process.cwd(), '.env.local');
    const ENV_LOCAL_BACKUP_PATH = join(process.cwd(), '.env.local.backup');

    beforeAll(() =>
    {
        if (!TEST_DATABASE_URL)
        {
            throw new Error('DATABASE_URL environment variable is required for tests');
        }

        // Backup existing .env.local if it exists
        if (existsSync(ENV_LOCAL_PATH))
        {
            const content = require('fs').readFileSync(ENV_LOCAL_PATH, 'utf-8');
            writeFileSync(ENV_LOCAL_BACKUP_PATH, content, 'utf-8');
        }
    });

    afterAll(async () =>
    {
        // Restore backup
        if (existsSync(ENV_LOCAL_BACKUP_PATH))
        {
            const content = require('fs').readFileSync(ENV_LOCAL_BACKUP_PATH, 'utf-8');
            writeFileSync(ENV_LOCAL_PATH, content, 'utf-8');
            unlinkSync(ENV_LOCAL_BACKUP_PATH);
        }

        await closeDatabase();
    });

    beforeEach(() =>
    {
        // Clear DATABASE_URL from process.env to simulate aena scenario
        delete process.env.DATABASE_URL;
        delete process.env.DATABASE_WRITE_URL;
        delete process.env.DATABASE_READ_URL;
        delete process.env.DATABASE_REPLICA_URL;
    });

    afterEach(async () =>
    {
        // Restore DATABASE_URL
        process.env.DATABASE_URL = TEST_DATABASE_URL;

        // Clean up .env.local
        if (existsSync(ENV_LOCAL_PATH))
        {
            unlinkSync(ENV_LOCAL_PATH);
        }

        await closeDatabase();
    });

    it('should load DATABASE_URL from .env.local when not in process.env', async () =>
    {
        // Create .env.local with DATABASE_URL
        const envContent = `DATABASE_URL=${TEST_DATABASE_URL}\n`;
        writeFileSync(ENV_LOCAL_PATH, envContent, 'utf-8');

        // Verify DATABASE_URL is not in process.env
        expect(process.env.DATABASE_URL).toBeUndefined();

        // Initialize database - should load from .env.local
        const { write, read } = await initDatabase();

        // Verify database was initialized
        expect(write).toBeDefined();
        expect(read).toBeDefined();

        // Verify DATABASE_URL was loaded
        expect(process.env.DATABASE_URL).toBe(TEST_DATABASE_URL);

        // Verify database connection works
        const result = await write!.execute('SELECT 1 as value');
        expect(result).toBeDefined();
    });

    it('should fail gracefully when .env.local does not exist and DATABASE_URL is not set', async () =>
    {
        // Ensure .env.local does not exist
        if (existsSync(ENV_LOCAL_PATH))
        {
            unlinkSync(ENV_LOCAL_PATH);
        }

        // Verify DATABASE_URL is not set
        expect(process.env.DATABASE_URL).toBeUndefined();

        // Initialize database - should return undefined
        const { write, read } = await initDatabase();

        expect(write).toBeUndefined();
        expect(read).toBeUndefined();
    });

    it('should work with Repository after loading from .env.local', async () =>
    {
        // Create .env.local
        const envContent = `DATABASE_URL=${TEST_DATABASE_URL}\n`;
        writeFileSync(ENV_LOCAL_PATH, envContent, 'utf-8');

        // Initialize database
        const { write } = await initDatabase();
        expect(write).toBeDefined();

        // Create test table
        await write!.execute(`
            CREATE TABLE IF NOT EXISTS test_files (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                filename TEXT NOT NULL,
                size BIGINT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Get repository (simulating aena's FileRepository)
        const repo = getRepository(testFiles);

        // Test save operation (this is where aena's error occurs)
        const savedFile = await repo.save({
            filename: 'test.txt',
            size: 1024,
        });

        expect(savedFile).toBeDefined();
        expect(savedFile.filename).toBe('test.txt');
        expect(savedFile.size).toBe(1024);
        expect(savedFile.id).toBeDefined();

        // Test find operation
        const foundFile = await repo.findById(savedFile.id);
        expect(foundFile).toBeDefined();
        expect(foundFile?.filename).toBe('test.txt');

        // Cleanup
        await write!.execute(`DROP TABLE IF EXISTS test_files;`);
    });

    it('should log debug information when .env.local loading fails', async () =>
    {
        // This test verifies our debug logging works
        if (existsSync(ENV_LOCAL_PATH))
        {
            unlinkSync(ENV_LOCAL_PATH);
        }

        // Capture console output
        const logs: string[] = [];
        const originalLog = console.log;
        const originalDebug = console.debug;
        console.log = (...args: any[]) => logs.push(args.join(' '));
        console.debug = (...args: any[]) => logs.push(args.join(' '));

        try
        {
            await initDatabase();

            // Verify some debug output was generated
            // (Our updated factory.ts should log debug info)
            expect(logs.length).toBeGreaterThan(0);
        }
        finally
        {
            // Restore console
            console.log = originalLog;
            console.debug = originalDebug;
        }
    });

    it('should handle absolute path for .env.local correctly', async () =>
    {
        // Create .env.local with absolute path reference
        const envContent = `DATABASE_URL=${TEST_DATABASE_URL}\n`;
        writeFileSync(ENV_LOCAL_PATH, envContent, 'utf-8');

        // Verify cwd-based path resolution works
        const cwd = process.cwd();
        const envPath = `${cwd}/.env.local`;

        expect(existsSync(envPath)).toBe(true);

        // Initialize database
        const { write } = await initDatabase();
        expect(write).toBeDefined();
        expect(process.env.DATABASE_URL).toBe(TEST_DATABASE_URL);
    });
});