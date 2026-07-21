import type { NextConfig } from 'next';
import { devHtmlRewrites } from '@spfn/pages-next/dev';

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig =
    {
    // Static export — deployable to any static host (Cloudflare Pages, Vercel, nginx).
    // Build-only: export-mode enforcement in dev would reject the dev html rewrites.
        ...(isDev ? {} : { output: 'export' as const }),
        // Dev-only route files (route.dev.ts) are routable only in next dev.
        pageExtensions: isDev ? ['ts', 'tsx', 'dev.ts'] : ['ts', 'tsx'],
        images: { unoptimized: true },
        // Dev only: designed html pages served fresh from ../site/pages on every
        // request (next dev resolves the catch-all before public/).
        ...(isDev
            ? { rewrites: async () => ({ beforeFiles: await devHtmlRewrites('../site') }) }
            : {}),
    };

export default nextConfig;
