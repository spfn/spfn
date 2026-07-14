import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        'shared/index': 'src/shared/index.ts',
        'server/index': 'src/server/index.ts',
        'server/keys': 'src/server/keys.ts',
        'server/local.provider': 'src/server/local.provider.ts',
        'server/gcs.provider': 'src/server/gcs.provider.ts',
        'server/s3.provider': 'src/server/s3.provider.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    external: [
        '@aws-sdk/client-s3',
        '@aws-sdk/s3-request-presigner',
        '@google-cloud/storage',
    ],
});
