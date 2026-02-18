import { defineConfig } from 'tsup';

import { sharedExternal } from './tsup.shared';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        server: 'src/server.ts',
        'config/index': 'src/config/index.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    external: sharedExternal,
});
