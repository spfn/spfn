import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    reactCompiler: true,

    async rewrites()
    {
        return [
            {
                // Provider callbacks must return to the web origin so the host-only
                // OAuth CSRF cookie is present. Next forwards the request to SPFN.
                source: '/_auth/:path*',
                destination: `${process.env.SPFN_API_URL || 'http://localhost:8890'}/_auth/:path*`,
            },
        ];
    },

    webpack(config)
    {
        // SVGR: Import SVG as React components
        const fileLoaderRule = (config.module.rules as any[])
            .find((rule: any) => Array.isArray(rule.oneOf))
            ?.oneOf.find((rule: any) => rule.test?.test?.('.svg'));

        if (fileLoaderRule) 
        {
            fileLoaderRule.exclude = /\.svg$/i;
        }

        config.module.rules.unshift({
            test: /\.svg$/i,
            use: ['@svgr/webpack'],
        });

        return config;
    },
    turbopack: {
        rules: {
            '*.svg': {
                loaders: ['@svgr/webpack'],
                as: '*.js',
            },
        },
    },
};

export default nextConfig;
