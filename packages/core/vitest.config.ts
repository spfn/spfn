import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.{test,spec}.{js,ts}'],
    },
    resolve: {
        alias: {
            '@/server/core': resolve(__dirname, './src'),
            '@/server/entities': resolve(__dirname, './src/tests/fixtures/entities'),
        },
    },
});