import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Integration Tests Configuration
 *
 * Tests that require external infrastructure (Redis, PostgreSQL)
 *
 * Prerequisites:
 * - Run: docker compose -f ../../docker-compose.test.yml up -d
 *
 * Modules:
 * - cache (requires Redis)
 * - db (requires PostgreSQL)
 * - server (integration tests)
 */
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: [
            'src/cache/**/*.{test,spec}.{js,ts}',
            'src/db/**/*.{test,spec}.{js,ts}',
            'src/server/**/*.{test,spec}.{js,ts}',
        ],
        // Integration tests run sequentially to avoid resource conflicts
        poolOptions: {
            threads: {
                maxThreads: 1,
                minThreads: 1,
            },
        },
        // Longer timeout for infrastructure operations
        testTimeout: 30000,
        // Run test files sequentially
        fileParallelism: false,
        // Isolate tests in separate processes
        isolate: true,
    },
    resolve: {
        alias: {
            '@core': resolve(__dirname, './src'),
            '@/server/entities': resolve(__dirname, './src/db/__tests__/fixtures/entities'),
        },
    },
});