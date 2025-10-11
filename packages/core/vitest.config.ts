import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.{test,spec}.{js,ts}'],
        // DB setup은 DB 모듈 테스트에서만 개별적으로 import
        // setupFiles: ['src/db/__tests__/setup.ts'],

        // Limit parallel execution to reduce memory usage
        poolOptions: {
            threads: {
                maxThreads: 1,
                minThreads: 1,
            },
        },
    },
    resolve: {
        alias: {
            '@core': resolve(__dirname, './src'),
            '@/server/entities': resolve(__dirname, './src/db/__tests__/fixtures/entities'),
        },
    },
});