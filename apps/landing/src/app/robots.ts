/**
 * Robots.txt for SPFN Landing Page
 *
 * Uses reusable SEO utilities from @/lib/seo
 * Configuration in @/config/seo.config.ts
 *
 * Supports AI crawler management (GPTBot, ClaudeBot, etc.)
 */

import { MetadataRoute } from 'next';
import { generateRobots } from '@/lib/seo';
import { seoConfig } from '@/config/seo.config';

export default function robots(): MetadataRoute.Robots {
  return generateRobots(seoConfig);
}

/**
 * Example: Block all AI crawlers
 *
 * ```ts
 * import { blockAICrawlers } from '@/lib/seo';
 *
 * export default function robots(): MetadataRoute.Robots {
 *   const config = blockAICrawlers(seoConfig);
 *   return generateRobots(config);
 * }
 * ```
 */

/**
 * Example: Allow specific AI crawlers only
 *
 * ```ts
 * import { allowSpecificAICrawlers, AI_CRAWLERS } from '@/lib/seo';
 *
 * export default function robots(): MetadataRoute.Robots {
 *   // Allow only OpenAI and Anthropic
 *   const config = allowSpecificAICrawlers(seoConfig, [
 *     ...AI_CRAWLERS.openai,
 *     ...AI_CRAWLERS.anthropic,
 *   ]);
 *   return generateRobots(config);
 * }
 * ```
 */