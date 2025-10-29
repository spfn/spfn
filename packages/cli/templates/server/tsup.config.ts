import { defineConfig } from 'tsup';
import path from 'path';

export default defineConfig({
    entry: {
        'routes/index': './routes/index.ts',
        'entities/index': './entities/index.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: false,
    target: 'es2022',
    outDir: '../../.spfn/server',
    splitting: false,
    esbuildOptions(options) {
        options.alias = {
            '@': path.resolve(__dirname, '../../src'),
        };
    },
});