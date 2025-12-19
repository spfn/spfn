import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        'index': 'src/index.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: {
        preset: 'smallest',
        propertyReadSideEffects: false,
    },
    external: [
        /^@spfn\//,
        '@sinclair/typebox',
        'drizzle-orm',
        'postgres',
        'pg-boss',
    ],
});
