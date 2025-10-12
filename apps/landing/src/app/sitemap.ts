import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap
{
    const baseUrl = 'https://superfunction.xyz';

    return [
        {
            url: baseUrl,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 1,
        },
    ];
}