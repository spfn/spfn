/**
 * Sitemap for SPFN Landing Page
 *
 * Uses reusable SEO utilities from @/lib/seo
 * Configuration in @/config/seo.config.ts
 */

import { MetadataRoute } from 'next';
import { generateSitemap } from '@/lib/seo';
import { seoConfig } from '@/config/seo.config';

export default function sitemap(): MetadataRoute.Sitemap {
  return generateSitemap(seoConfig);
}

/**
 * Example: Adding dynamic routes (for future use)
 *
 * ```ts
 * import { addDynamicRoutes } from '@/lib/seo';
 *
 * export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
 *   // Fetch dynamic content from database
 *   const posts = await db.posts.findAll();
 *
 *   // Convert to sitemap routes
 *   const dynamicRoutes = posts.map(post => ({
 *     url: `/blog/${post.slug}`,
 *     lastModified: post.updatedAt,
 *     priority: 0.7,
 *   }));
 *
 *   // Add dynamic routes to config
 *   const config = addDynamicRoutes(seoConfig, dynamicRoutes);
 *
 *   return generateSitemap(config);
 * }
 * ```
 */