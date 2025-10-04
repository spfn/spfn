import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/server/index.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    minify: false,
    external: ['drizzle-orm', 'hono', 'ioredis'],
});