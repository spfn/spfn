# SEO Implementation Guide

This landing page uses a **reusable SEO configuration system** that can be easily extracted to an `@spfn/seo` module.

## 📁 File Structure

```
src/
├── config/
│   └── seo.config.ts          # Centralized SEO configuration
├── lib/
│   └── seo/
│       ├── index.ts           # Main exports
│       ├── sitemap.ts         # Sitemap generation utilities
│       └── robots.ts          # Robots.txt generation utilities
└── app/
    ├── sitemap.ts             # Uses generateSitemap()
    └── robots.ts              # Uses generateRobots()
```

## 🎯 Key Features

### 1. Configuration-Based
All SEO settings are centralized in `src/config/seo.config.ts`:

```typescript
import { seoConfig } from '@/config/seo.config';

// Access domain
const domain = seoConfig.domain;

// Access routes for sitemap
const routes = seoConfig.sitemap.routes;

// Access AI crawler settings
const allowAI = seoConfig.robots.allowAI;
```

### 2. Reusable Utilities
All generation logic is in `src/lib/seo/`:

```typescript
import { generateSitemap, generateRobots } from '@/lib/seo';

// Generate sitemap from config
const sitemap = generateSitemap(seoConfig);

// Generate robots.txt from config
const robots = generateRobots(seoConfig);
```

### 3. Type-Safe
Full TypeScript support with interfaces:

```typescript
import type { SEOConfig, SitemapRoute } from '@/lib/seo';
```

## 📝 Usage Examples

### Sitemap

**Basic Usage:**
```typescript
// app/sitemap.ts
import { generateSitemap } from '@/lib/seo';
import { seoConfig } from '@/config/seo.config';

export default function sitemap() {
  return generateSitemap(seoConfig);
}
```

**With Dynamic Routes:**
```typescript
import { generateSitemap, addDynamicRoutes } from '@/lib/seo';

export default async function sitemap() {
  // Fetch from database
  const posts = await db.posts.findAll();

  // Convert to sitemap routes
  const dynamicRoutes = posts.map(post => ({
    url: `/blog/${post.slug}`,
    lastModified: post.updatedAt,
    priority: 0.7,
  }));

  // Add to config and generate
  const config = addDynamicRoutes(seoConfig, dynamicRoutes);
  return generateSitemap(config);
}
```

### Robots.txt

**Basic Usage:**
```typescript
// app/robots.ts
import { generateRobots } from '@/lib/seo';
import { seoConfig } from '@/config/seo.config';

export default function robots() {
  return generateRobots(seoConfig);
}
```

**Block All AI Crawlers:**
```typescript
import { generateRobots, blockAICrawlers } from '@/lib/seo';

export default function robots() {
  const config = blockAICrawlers(seoConfig);
  return generateRobots(config);
}
```

**Allow Specific AI Crawlers:**
```typescript
import { generateRobots, allowSpecificAICrawlers, AI_CRAWLERS } from '@/lib/seo';

export default function robots() {
  // Allow only OpenAI and Anthropic
  const config = allowSpecificAICrawlers(seoConfig, [
    ...AI_CRAWLERS.openai,
    ...AI_CRAWLERS.anthropic,
  ]);
  return generateRobots(config);
}
```

## 🔧 Configuration

Edit `src/config/seo.config.ts` to customize:

```typescript
export const seoConfig: SEOConfig = {
  domain: 'https://yoursite.com',

  defaultMetadata: {
    siteName: 'Your Site',
    locale: 'en_US',
    description: 'Your description',
  },

  sitemap: {
    routes: [
      { url: '/', priority: 1.0 },
      { url: '/about', priority: 0.8 },
    ],
    defaultChangeFrequency: 'weekly',
  },

  robots: {
    allowAI: true,
    disallow: ['/admin/', '/private/'],
    aiCrawlers: [
      'GPTBot',
      'ClaudeBot',
      'Google-Extended',
      // ... more crawlers
    ],
  },
};
```

## 🚀 Extracting to @spfn/seo Module

To convert this to a reusable npm package:

1. **Copy files to new package:**
   ```
   packages/seo/
   ├── src/
   │   ├── index.ts
   │   ├── config.ts
   │   ├── sitemap.ts
   │   └── robots.ts
   └── package.json
   ```

2. **Create package.json:**
   ```json
   {
     "name": "@spfn/seo",
     "version": "0.1.0",
     "main": "./dist/index.js",
     "types": "./dist/index.d.ts",
     "peerDependencies": {
       "next": ">=15.0.0"
     }
   }
   ```

3. **Use in any project:**
   ```bash
   npm install @spfn/seo
   ```

   ```typescript
   import { generateSitemap, generateRobots } from '@spfn/seo';
   ```

## 🌐 Generated Files

After build, these files are available:

- `/sitemap.xml` - Static sitemap
- `/robots.txt` - Static robots.txt

Test locally:
```bash
npm run build
npm run start

# Access at:
# http://localhost:3000/sitemap.xml
# http://localhost:3000/robots.txt
```

## 🎨 AI Crawler Support (2025)

The configuration supports modern AI crawlers:

| Crawler | Company | Purpose |
|---------|---------|---------|
| GPTBot | OpenAI | ChatGPT training |
| ClaudeBot | Anthropic | Claude training |
| Google-Extended | Google | Bard/Gemini training |
| PerplexityBot | Perplexity | Search AI |
| Applebot-Extended | Apple | Apple Intelligence |

Configure via `seoConfig.robots.allowAI` and `seoConfig.robots.aiCrawlers`.

## 📊 SEO Best Practices (2025)

### What Works:
✅ Accurate `lastModified` dates in sitemap
✅ Canonical URLs only
✅ robots.txt with sitemap link
✅ Submit to Google Search Console
✅ AI crawler management

### What Doesn't Work:
❌ `<priority>` tag (ignored by Google)
❌ `<changefreq>` tag (ignored by Google)

## 📚 Additional Resources

- [Next.js Metadata API](https://nextjs.org/docs/app/api-reference/file-conventions/metadata)
- [Sitemaps Protocol](https://www.sitemaps.org/)
- [robots.txt Specification](https://www.robotstxt.org/)

---

Built for SPFN Landing Page | Designed for reusability