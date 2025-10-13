/**
 * Sitemap Generation Helpers
 *
 * Reusable utilities for generating sitemap.xml based on configuration.
 * Can be extracted to @spfn/seo module in the future.
 */

import { MetadataRoute } from 'next';
import type { SEOConfig, SitemapRoute } from '@/config/seo.config';

/**
 * Generate sitemap entries from SEO configuration
 *
 * @param config - SEO configuration object
 * @returns Array of sitemap entries
 *
 * @example
 * ```ts
 * import { generateSitemap } from '@/lib/seo/sitemap';
 * import { seoConfig } from '@/config/seo.config';
 *
 * export default function sitemap(): MetadataRoute.Sitemap {
 *   return generateSitemap(seoConfig);
 * }
 * ```
 */
export function generateSitemap(config: SEOConfig): MetadataRoute.Sitemap {
  const now = new Date();

  return config.sitemap.routes.map((route) => {
    const url = getAbsoluteUrl(route.url, config.domain);

    return {
      url,
      lastModified: route.lastModified || now,
      changeFrequency: route.changeFrequency || config.sitemap.defaultChangeFrequency,
      priority: route.priority ?? 0.5,
    };
  });
}

/**
 * Add dynamic routes to sitemap configuration
 *
 * Useful for adding database-driven routes (blog posts, products, etc.)
 *
 * @param config - Base SEO configuration
 * @param dynamicRoutes - Additional routes to add
 * @returns Updated configuration with dynamic routes
 *
 * @example
 * ```ts
 * const posts = await db.posts.findAll();
 * const dynamicRoutes = posts.map(post => ({
 *   url: `/blog/${post.slug}`,
 *   lastModified: post.updatedAt,
 *   priority: 0.7,
 * }));
 *
 * const config = addDynamicRoutes(seoConfig, dynamicRoutes);
 * return generateSitemap(config);
 * ```
 */
export function addDynamicRoutes(
  config: SEOConfig,
  dynamicRoutes: SitemapRoute[]
): SEOConfig {
  return {
    ...config,
    sitemap: {
      ...config.sitemap,
      routes: [...config.sitemap.routes, ...dynamicRoutes],
    },
  };
}

/**
 * Create a single sitemap entry
 *
 * @param url - URL or path
 * @param options - Entry options
 * @returns Sitemap entry
 *
 * @example
 * ```ts
 * const entry = createSitemapEntry('/about', {
 *   priority: 0.8,
 *   changeFrequency: 'monthly',
 * });
 * ```
 */
export function createSitemapEntry(
  url: string,
  options?: {
    lastModified?: Date;
    changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
    priority?: number;
  }
): MetadataRoute.Sitemap[number] {
  return {
    url,
    lastModified: options?.lastModified || new Date(),
    changeFrequency: options?.changeFrequency || 'weekly',
    priority: options?.priority ?? 0.5,
  };
}

/**
 * Convert relative path to absolute URL
 */
function getAbsoluteUrl(urlOrPath: string, domain: string): string {
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    return urlOrPath;
  }

  const path = urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`;
  return `${domain}${path}`;
}

/**
 * Validate sitemap size
 *
 * Sitemaps must not exceed 50,000 URLs or 50MB uncompressed
 *
 * @param entries - Sitemap entries
 * @returns Validation result
 */
export function validateSitemapSize(entries: MetadataRoute.Sitemap): {
  valid: boolean;
  urlCount: number;
  exceedsLimit: boolean;
} {
  const urlCount = entries.length;
  const exceedsLimit = urlCount > 50000;

  return {
    valid: !exceedsLimit,
    urlCount,
    exceedsLimit,
  };
}

/**
 * Split large sitemap into multiple sitemaps
 *
 * @param entries - All sitemap entries
 * @param chunkSize - Max URLs per sitemap (default: 50000)
 * @returns Array of sitemap chunks
 */
export function splitSitemap(
  entries: MetadataRoute.Sitemap,
  chunkSize: number = 50000
): MetadataRoute.Sitemap[] {
  const chunks: MetadataRoute.Sitemap[] = [];

  for (let i = 0; i < entries.length; i += chunkSize) {
    chunks.push(entries.slice(i, i + chunkSize));
  }

  return chunks;
}
