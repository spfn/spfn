import { defineConfig } from 'tsup';

import { sharedExternal } from './tsup.shared';

export default defineConfig({
    entry: {
        'nextjs/client': 'src/nextjs/client.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    splitting: false,
    banner: { js: `'use client';` },
    external: sharedExternal,
});
