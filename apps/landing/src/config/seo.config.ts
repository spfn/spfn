/**
 * SEO Configuration
 *
 * This configuration file provides centralized SEO settings for the application.
 * It can be easily extracted to a reusable module (@spfn/seo) in the future.
 *
 * @example
 * ```ts
 * import { seoConfig } from '@/config/seo.config';
 * const baseUrl = seoConfig.domain;
 * ```
 */

export interface SEOConfig {
  /** Base domain URL (without trailing slash) */
  domain: string;

  /** Default metadata */
  defaultMetadata: {
    siteName: string;
    locale: string;
    description: string;
  };

  /** Sitemap configuration */
  sitemap: {
    /** Routes to include in sitemap */
    routes: SitemapRoute[];
    /** Default change frequency */
    defaultChangeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  };

  /** Robots.txt configuration */
  robots: {
    /** Allow AI crawlers to access content */
    allowAI: boolean;
    /** Paths to disallow from crawling */
    disallow: string[];
    /** AI crawler user agents to configure */
    aiCrawlers: string[];
  };
}

export interface SitemapRoute {
  /** URL path or full URL */
  url: string;
  /** Change frequency */
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  /** Priority (0.0 to 1.0) */
  priority?: number;
  /** Last modification date (optional, defaults to now) */
  lastModified?: Date;
}

/**
 * SEO Configuration for SPFN Landing Page
 */
export const seoConfig: SEOConfig = {
  domain: 'https://superfunction.xyz',

  defaultMetadata: {
    siteName: 'Superfunction',
    locale: 'en_US',
    description: 'Type-safe backend framework for Next.js. Build scalable APIs with contract-based routing, automatic client generation, Drizzle ORM, transactions, connection pooling, and end-to-end type safety.',
  },

  sitemap: {
    routes: [
      {
        url: '/',
        changeFrequency: 'weekly',
        priority: 1.0,
      },
      // Documentation pages (high priority for SEO and AI crawlers)
      {
        url: '/docs',
        changeFrequency: 'weekly',
        priority: 0.95,
      },
      {
        url: '/docs/installation',
        changeFrequency: 'weekly',
        priority: 0.9,
      },
      {
        url: '/docs/concepts',
        changeFrequency: 'weekly',
        priority: 0.9,
      },
      {
        url: '/docs/examples',
        changeFrequency: 'weekly',
        priority: 0.9,
      },
      // External documentation links
      {
        url: 'https://github.com/spfn/spfn',
        changeFrequency: 'weekly',
        priority: 0.8,
      },
      {
        url: 'https://github.com/spfn/spfn/tree/main/packages/core',
        changeFrequency: 'weekly',
        priority: 0.8,
      },
      {
        url: 'https://github.com/spfn/spfn/tree/main/packages/spfn',
        changeFrequency: 'weekly',
        priority: 0.8,
      },
      {
        url: 'https://www.npmjs.com/package/@spfn/core',
        changeFrequency: 'monthly',
        priority: 0.7,
      },
      {
        url: 'https://www.npmjs.com/package/spfn',
        changeFrequency: 'monthly',
        priority: 0.7,
      },
    ],
    defaultChangeFrequency: 'weekly',
  },

  robots: {
    allowAI: true,
    disallow: ['/api/', '/private/'],
    aiCrawlers: [
      'GPTBot',           // OpenAI
      'ChatGPT-User',     // OpenAI
      'ClaudeBot',        // Anthropic
      'Google-Extended',  // Google Bard
      'PerplexityBot',    // Perplexity
      'Applebot-Extended', // Apple Intelligence
      'anthropic-ai',     // Anthropic (alternative)
      'Omgilibot',        // Omgili
      'FacebookBot',      // Meta
    ],
  },
};

/**
 * Helper to get full URL
 */
export function getFullUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${seoConfig.domain}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Helper to get sitemap URL
 */
export function getSitemapUrl(): string {
  return `${seoConfig.domain}/sitemap.xml`;
}