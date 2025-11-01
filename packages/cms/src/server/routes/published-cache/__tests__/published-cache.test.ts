/**
 * CMS Published Cache Routes Tests
 *
 * Tests GET /published-cache endpoint
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb } from '@/__tests__/helpers/db';
import { cmsPublishedCacheRepository } from '@/server/repositories';
import publishedCacheApp from '../index';

describe('GET /published-cache', () =>
{
    beforeAll(async () =>
    {
        await setupTestDb();
    });

    afterAll(async () =>
    {
        await teardownTestDb();
    });

    beforeEach(async () =>
    {
        const db = getTestDb();
        await clearTables(db);
    });

    it('should get single section cache', async () =>
    {
        // Create test data
        await cmsPublishedCacheRepository.upsert({
            section: 'home',
            locale: 'ko',
            content: {
                'home.hero.title': 'Welcome to SPFN',
                'home.hero.subtitle': 'Build faster',
            },
            publishedAt: new Date(),
            publishedBy: 'test-user',
        });

        const res = await publishedCacheApp.request('/published-cache?sections=home&locale=ko');

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toHaveLength(1);
        expect(data[0].section).toBe('home');
        expect(data[0].locale).toBe('ko');
        expect(data[0].content).toEqual({
            'home.hero.title': 'Welcome to SPFN',
            'home.hero.subtitle': 'Build faster',
        });
        expect(data[0].version).toBeDefined();
        expect(data[0].publishedAt).toBeDefined();
    });

    it('should get multiple sections cache', async () =>
    {
        // Create test data
        await cmsPublishedCacheRepository.upsert({
            section: 'home',
            locale: 'ko',
            content: { 'home.title': 'Home' },
            publishedAt: new Date(),
            publishedBy: 'test-user',
        });

        await cmsPublishedCacheRepository.upsert({
            section: 'footer',
            locale: 'ko',
            content: { 'footer.copyright': '© 2024' },
            publishedAt: new Date(),
            publishedBy: 'test-user',
        });

        const res = await publishedCacheApp.request('/published-cache?sections=home&sections=footer&locale=ko');

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toHaveLength(2);
        expect(data.find((d: any) => d.section === 'home')).toBeDefined();
        expect(data.find((d: any) => d.section === 'footer')).toBeDefined();
    });

    it('should filter by locale', async () =>
    {
        // Create test data for multiple locales
        await cmsPublishedCacheRepository.upsert({
            section: 'home',
            locale: 'ko',
            content: { 'home.title': '환영합니다' },
            publishedAt: new Date(),
            publishedBy: 'test-user',
        });

        await cmsPublishedCacheRepository.upsert({
            section: 'home',
            locale: 'en',
            content: { 'home.title': 'Welcome' },
            publishedAt: new Date(),
            publishedBy: 'test-user',
        });

        const resKo = await publishedCacheApp.request('/published-cache?sections=home&locale=ko');
        const dataKo = await resKo.json();

        expect(dataKo).toHaveLength(1);
        expect(dataKo[0].locale).toBe('ko');
        expect(dataKo[0].content['home.title']).toBe('환영합니다');

        const resEn = await publishedCacheApp.request('/published-cache?sections=home&locale=en');
        const dataEn = await resEn.json();

        expect(dataEn).toHaveLength(1);
        expect(dataEn[0].locale).toBe('en');
        expect(dataEn[0].content['home.title']).toBe('Welcome');
    });

    it('should use default locale when not specified', async () =>
    {
        await cmsPublishedCacheRepository.upsert({
            section: 'home',
            locale: 'ko',
            content: { 'home.title': '환영합니다' },
            publishedAt: new Date(),
            publishedBy: 'test-user',
        });

        const res = await publishedCacheApp.request('/published-cache?sections=home');

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toHaveLength(1);
        expect(data[0].locale).toBe('ko');
    });

    it('should return empty array for non-existent section', async () =>
    {
        const res = await publishedCacheApp.request('/published-cache?sections=non-existent&locale=ko');

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toEqual([]);
    });

    it('should only return found sections when querying multiple', async () =>
    {
        await cmsPublishedCacheRepository.upsert({
            section: 'home',
            locale: 'ko',
            content: { 'home.title': 'Home' },
            publishedAt: new Date(),
            publishedBy: 'test-user',
        });

        const res = await publishedCacheApp.request('/published-cache?sections=home&sections=non-existent&locale=ko');

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data).toHaveLength(1);
        expect(data[0].section).toBe('home');
    });

    it('should handle complex content structure', async () =>
    {
        const complexContent = {
            'home.hero': {
                title: 'Welcome',
                subtitle: 'Build faster',
                cta: {
                    text: 'Get started',
                    link: '/start',
                },
            },
            'home.features': [
                { title: 'Fast', description: 'Lightning fast' },
                { title: 'Secure', description: 'Bank-level security' },
            ],
        };

        await cmsPublishedCacheRepository.upsert({
            section: 'home',
            locale: 'ko',
            content: complexContent,
            publishedAt: new Date(),
            publishedBy: 'test-user',
        });

        const res = await publishedCacheApp.request('/published-cache?sections=home&locale=ko');

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data[0].content).toEqual(complexContent);
    });

    it('should include version for cache invalidation', async () =>
    {
        await cmsPublishedCacheRepository.upsert({
            section: 'home',
            locale: 'ko',
            content: { 'home.title': 'V1' },
            publishedAt: new Date(),
            publishedBy: 'test-user',
        });

        const res1 = await publishedCacheApp.request('/published-cache?sections=home&locale=ko');
        const data1 = await res1.json();
        const version1 = data1[0].version;

        // Update content
        await cmsPublishedCacheRepository.upsert({
            section: 'home',
            locale: 'ko',
            content: { 'home.title': 'V2' },
            publishedAt: new Date(),
            publishedBy: 'test-user',
        });

        const res2 = await publishedCacheApp.request('/published-cache?sections=home&locale=ko');
        const data2 = await res2.json();
        const version2 = data2[0].version;

        expect(version2).toBeGreaterThan(version1);
    });
});