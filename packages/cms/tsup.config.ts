import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        server: 'src/server.ts',
        client: 'src/client.ts',
        actions: 'src/actions.ts',
        store: 'src/store.ts',
        types: 'src/types.ts',
        'labels/index': 'src/labels/index.ts',
        'generators/index': 'src/generators/index.ts',
        'repositories/index': 'src/repositories/index.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    external: [
        '@spfn/core',
        'drizzle-orm',
        'next',
        'react',
        '@sinclair/typebox',
        'jiti',
        'zustand',
        'server-only',
        'react-dom',
    ],
});
