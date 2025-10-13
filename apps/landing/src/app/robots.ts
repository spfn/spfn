import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // General search engines
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/private/'],
      },
      // AI crawlers - separate rules
      {
        userAgent: [
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
        allow: '/',
        disallow: [],
      },
    ],
    sitemap: 'https://superfunction.xyz/sitemap.xml',
  };
}
