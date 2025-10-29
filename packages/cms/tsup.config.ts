import { defineConfig } from 'tsup';
import { glob } from 'glob';
import path from 'path';

// Find all route handler files
const routeFiles = glob.sync('src/routes/**/index.ts');
const routeEntries = Object.fromEntries(
    routeFiles.map((file) => {
        const key = file
            .replace('src/', '')
            .replace('/index.ts', '/index')
            .replace('.ts', '');
        return [key, file];
    })
);

// Find all entity files
const entityFiles = glob.sync('src/entities/**/*.ts');
const entityEntries = Object.fromEntries(
    entityFiles.map((file) => {
        const key = file.replace('src/', '').replace('.ts', '');
        return [key, file];
    })
);

// Find all contract files
const contractFiles = glob.sync('src/contracts/**/*.ts');
const contractEntries = Object.fromEntries(
    contractFiles.map((file) => {
        const key = file.replace('src/', '').replace('.ts', '');
        return [key, file];
    })
);

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
        ...entityEntries,
        ...contractEntries,
        ...routeEntries,
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    esbuildOptions(options) {
        // Add path alias support
        options.alias = {
            '@': path.resolve(__dirname, './src'),
        };
    },
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
