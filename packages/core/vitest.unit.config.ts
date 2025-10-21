import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Unit Tests Configuration
 *
 * Fast tests that don't require external infrastructure (Redis, PostgreSQL, etc.)
 *
 * Modules:
 * - logger (pure logging logic)
 * - errors (error classes and utilities)
 * - codegen (code generation)
 * - route (routing logic)
 * - client (HTTP client)
 * - middleware (request/response handling)
 * - env (environment variable loading)
 */
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: [
            'src/logger/**/*.{test,spec}.{js,ts}',
            'src/errors/**/*.{test,spec}.{js,ts}',
            'src/codegen/**/*.{test,spec}.{js,ts}',
            'src/route/**/*.{test,spec}.{js,ts}',
            'src/client/**/*.{test,spec}.{js,ts}',
            'src/middleware/**/*.{test,spec}.{js,ts}',
            'src/env/**/*.{test,spec}.{js,ts}',
        ],
        // Unit tests can run in parallel for speed
        poolOptions: {
            threads: {
                maxThreads: 4,
                minThreads: 1,
            },
        },
    },
    resolve: {
        alias: {
            '@core': resolve(__dirname, './src'),
        },
    },
});