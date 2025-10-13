/**
 * Robots.txt Generation Helpers
 *
 * Reusable utilities for generating robots.txt based on configuration.
 * Can be extracted to @spfn/seo module in the future.
 */

import { MetadataRoute } from 'next';
import type { SEOConfig } from '@/config/seo.config';

/**
 * Generate robots.txt configuration from SEO config
 *
 * @param config - SEO configuration object
 * @returns Robots.txt configuration
 *
 * @example
 * ```ts
 * import { generateRobots } from '@/lib/seo/robots';
 * import { seoConfig } from '@/config/seo.config';
 *
 * export default function robots(): MetadataRoute.Robots {
 *   return generateRobots(seoConfig);
 * }
 * ```
 */
export function generateRobots(config: SEOConfig): MetadataRoute.Robots {
  const rules: MetadataRoute.Robots['rules'] = [];

  // General search engines
  rules.push({
    userAgent: '*',
    allow: '/',
    disallow: config.robots.disallow,
  });

  // AI crawlers - separate rules
  if (config.robots.aiCrawlers.length > 0) {
    rules.push({
      userAgent: config.robots.aiCrawlers,
      allow: config.robots.allowAI ? '/' : undefined,
      disallow: config.robots.allowAI ? [] : ['/'],
    });
  }

  return {
    rules,
    sitemap: `${config.domain}/sitemap.xml`,
  };
}

/**
 * Create custom robots rules
 *
 * @param userAgent - User agent string or array
 * @param options - Rule options
 * @returns Robots rule
 *
 * @example
 * ```ts
 * const rule = createRobotsRule('Googlebot', {
 *   allow: ['/public'],
 *   disallow: ['/private'],
 *   crawlDelay: 10,
 * });
 * ```
 */
export function createRobotsRule(
  userAgent: string | string[],
  options: {
    allow?: string | string[];
    disallow?: string | string[];
    crawlDelay?: number;
  }
) {
  return {
    userAgent,
    allow: options.allow,
    disallow: options.disallow,
    crawlDelay: options.crawlDelay,
  };
}

/**
 * Common AI crawler user agents (2025)
 *
 * Keep this list updated as new AI crawlers emerge
 */
export const AI_CRAWLERS = {
  // OpenAI
  openai: ['GPTBot', 'ChatGPT-User'],

  // Anthropic
  anthropic: ['ClaudeBot', 'anthropic-ai'],

  // Google
  google: ['Google-Extended', 'Bard-Google'],

  // Others
  perplexity: ['PerplexityBot'],
  apple: ['Applebot-Extended'],
  meta: ['FacebookBot', 'Meta-ExternalAgent'],
  cohere: ['cohere-ai'],

  // Get all AI crawlers
  all: [
    'GPTBot',
    'ChatGPT-User',
    'ClaudeBot',
    'anthropic-ai',
    'Google-Extended',
    'Bard-Google',
    'PerplexityBot',
    'Applebot-Extended',
    'FacebookBot',
    'Meta-ExternalAgent',
    'cohere-ai',
    'Omgilibot',
  ],
};

/**
 * Block all AI crawlers
 *
 * @param config - Base SEO configuration
 * @returns Updated configuration with AI crawlers blocked
 *
 * @example
 * ```ts
 * const configWithBlockedAI = blockAICrawlers(seoConfig);
 * return generateRobots(configWithBlockedAI);
 * ```
 */
export function blockAICrawlers(config: SEOConfig): SEOConfig {
  return {
    ...config,
    robots: {
      ...config.robots,
      allowAI: false,
      aiCrawlers: AI_CRAWLERS.all,
    },
  };
}

/**
 * Allow specific AI crawlers only
 *
 * @param config - Base SEO configuration
 * @param allowedCrawlers - Array of crawler names to allow
 * @returns Updated configuration
 *
 * @example
 * ```ts
 * // Allow only OpenAI and Anthropic
 * const config = allowSpecificAICrawlers(seoConfig, [
 *   ...AI_CRAWLERS.openai,
 *   ...AI_CRAWLERS.anthropic,
 * ]);
 * ```
 */
export function allowSpecificAICrawlers(
  config: SEOConfig,
  allowedCrawlers: string[]
): SEOConfig {
  const blockedCrawlers = AI_CRAWLERS.all.filter(
    (crawler) => !allowedCrawlers.includes(crawler)
  );

  return {
    ...config,
    robots: {
      ...config.robots,
      allowAI: true,
      aiCrawlers: [...config.robots.aiCrawlers, ...blockedCrawlers],
    },
  };
}