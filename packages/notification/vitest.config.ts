import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,

        // One worker, one file at a time. The repo's tests share a single local
        // PostgreSQL and Redis, and this machine has fewer cores than Vitest
        // would otherwise fork — parallel runs starve each other and time out
        // before assertions run.
        fileParallelism: false,
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
        environment: 'node',
        include: ['src/**/*.{test,spec}.{js,ts}'],
    },
});
