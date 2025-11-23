/**
 * Database Test Fixture
 *
 * Reusable helper for integration tests that need database access.
 * Provides type-safe database instance without null checks.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { initDatabase, getDatabase, closeDatabase } from '../../manager';

export interface DbTestFixture
{
    /**
     * Database instance (only available when isAvailable is true)
     * @throws Error if accessed when database is not available
     */
    readonly db: PostgresJsDatabase<Record<string, unknown>>;

    /**
     * Whether the database is available for testing
     */
    readonly isAvailable: boolean;

    /**
     * Initialize database connection
     * Call this in beforeAll()
     */
    setup(): Promise<void>;

    /**
     * Close database connection
     * Call this in afterAll()
     */
    teardown(): Promise<void>;

    /**
     * Truncate specified table(s)
     * Call this in beforeEach() to clean test data
     */
    cleanTable(...tableNames: string[]): Promise<void>;

    /**
     * Execute raw SQL (only when database is available)
     */
    execute(sql: string): Promise<void>;
}

/**
 * Create a database test fixture for integration tests
 *
 * @example
 * ```typescript
 * describe('My Integration Test', () => {
 *     const dbFixture = createDbTestFixture();
 *
 *     beforeAll(() => dbFixture.setup());
 *     afterAll(() => dbFixture.teardown());
 *     beforeEach(() => dbFixture.cleanTable('test_users'));
 *
 *     it.skipIf(!dbFixture.isAvailable)('should work', async () => {
 *         // No need for ! or null checks
 *         const users = await dbFixture.db.select().from(testUsers);
 *     });
 * });
 * ```
 */
export function createDbTestFixture(): DbTestFixture
{
    let _db!: PostgresJsDatabase<Record<string, unknown>>;
    let _isAvailable = false;

    return {
        get db()
        {
            if (!_isAvailable)
            {
                throw new Error(
                    'Database not initialized. Did you call setup() in beforeAll()?'
                );
            }
            return _db;
        },

        get isAvailable()
        {
            return _isAvailable;
        },

        async setup()
        {
            try
            {
                process.env.DATABASE_URL='postgresql://testuser:testpass@localhost:5532/spfn_test';
                await initDatabase();
                _db = getDatabase();
                _isAvailable = true;
            }
            catch (error)
            {
                _isAvailable = false;
                console.log('\n⚠️  PostgreSQL not available - skipping integration tests');
                console.log('   To run integration tests:');
                console.log('   1. Run: pnpm docker:test:up');
                console.log('   2. Wait for containers to be ready');
                console.log('   3. Run tests again\n');
            }
        },

        async teardown()
        {
            if (_isAvailable)
            {
                await closeDatabase();
            }
        },

        async cleanTable(...tableNames: string[])
        {
            if (_isAvailable && tableNames.length > 0)
            {
                const tables = tableNames.join(', ');
                await _db.execute(`TRUNCATE TABLE ${tables} CASCADE`);
            }
        },

        async execute(sql: string)
        {
            if (_isAvailable)
            {
                await _db.execute(sql);
            }
        },
    };
}