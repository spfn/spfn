import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    // SVGR: Import SVG as React components
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fileLoaderRule = (config.module.rules as any[])
      .find((rule: any) => Array.isArray(rule.oneOf))
      ?.oneOf.find((rule: any) => rule.test?.test?.('.svg'));

    if (fileLoaderRule) {
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
