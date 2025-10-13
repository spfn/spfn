/**
 * SEO Utilities
 *
 * Reusable SEO utilities that can be extracted to @spfn/seo module.
 *
 * @example
 * ```ts
 * import { generateSitemap, generateRobots } from '@/lib/seo';
 * import { seoConfig } from '@/config/seo.config';
 *
 * // In sitemap.ts
 * export default function sitemap() {
 *   return generateSitemap(seoConfig);
 * }
 *
 * // In robots.ts
 * export default function robots() {
 *   return generateRobots(seoConfig);
 * }
 * ```
 */

// Sitemap utilities
export {
  generateSitemap,
  addDynamicRoutes,
  createSitemapEntry,
  validateSitemapSize,
  splitSitemap,
} from './sitemap';

// Robots.txt utilities
export {
  generateRobots,
  createRobotsRule,
  blockAICrawlers,
  allowSpecificAICrawlers,
  AI_CRAWLERS,
} from './robots';

// Re-export types
export type {
  SEOConfig,
  SitemapRoute,
} from '@/config/seo.config';