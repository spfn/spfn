import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        'shared/index': 'src/shared/index.ts',
        'server/index': 'src/server/index.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
});
