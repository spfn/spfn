import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // PGlite boots PostgreSQL in WASM. Parallel cold starts contend heavily
        // enough to exhaust Vitest's per-test timeout before assertions run.
        fileParallelism: false,
        hookTimeout: 60_000,
        testTimeout: 60_000,
    },
});
