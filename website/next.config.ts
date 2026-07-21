import type { NextConfig } from 'next';

const nextConfig: NextConfig =
    {
    // Static export — deployable to any static host (Cloudflare Pages, Vercel, nginx).
        output: 'export',
        images: { unoptimized: true },
    };

export default nextConfig;
