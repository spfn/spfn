import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://superfunction.xyz';
  const now = new Date();

  return [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    // Documentation pages
    {
      url: `${baseUrl}/docs`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.95,
    },
    {
      url: `${baseUrl}/docs/installation`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/docs/concepts`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/docs/examples`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    // External documentation
    {
      url: 'https://github.com/spfn/spfn',
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: 'https://github.com/spfn/spfn/tree/main/packages/core',
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: 'https://github.com/spfn/spfn/tree/main/packages/spfn',
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: 'https://www.npmjs.com/package/@spfn/core',
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://www.npmjs.com/package/spfn',
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];
}
