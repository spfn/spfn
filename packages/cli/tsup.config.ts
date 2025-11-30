import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: false,
    splitting: false,
    target: 'es2022',
    outDir: 'dist',
    external: ['tsup', 'drizzle-orm', 'postgres'],
    noExternal: [],
});