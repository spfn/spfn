import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        cli: 'src/cli.ts',
        dev: 'src/dev.ts',
    },
    format: ['esm'],
    dts: { entry: { index: 'src/index.ts', dev: 'src/dev.ts' } },
    sourcemap: true,
    clean: true,
    splitting: false,
    external: ['react', 'react-dom', 'next', '@spfn/pages'],
});
