import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        'client': 'src/client.tsx',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    splitting: false,
    banner: { js: `'use client';` },
    external: [
        'react',
        'react/jsx-runtime',
    ],
});
