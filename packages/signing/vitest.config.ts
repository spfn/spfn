import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: false,

        // One worker, one file at a time — the repo convention. Nothing here
        // needs PostgreSQL or Redis, but a package that fans out on a machine
        // that is already running turbo starves the rest of the run.
        fileParallelism: false,
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
        environment: 'node',
        include: ['src/**/*.test.ts'],
        exclude: ['node_modules', 'dist'],
    },
});
