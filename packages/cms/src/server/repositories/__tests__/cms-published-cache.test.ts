/**
 * CMS Published Cache Repository Tests
 *
 * Tests published cache CRUD operations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb } from '@/__tests__/helpers/db';
import { cmsPublishedCacheRepository } from '../cms-published-cache.repository';

describe('CmsPublishedCacheRepository', () =>
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

    describe('upsert', () =>
    {
        it('should create new cache', async () =>
        {
            const result = await cmsPublishedCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                content: { 'home.title': 'Welcome' },
                publishedAt: new Date(),
                publishedBy: 'test-user',
            });

            expect(result.id).toBeDefined();
            expect(result.section).toBe('home');
            expect(result.locale).toBe('ko');
            expect(result.content).toEqual({ 'home.title': 'Welcome' });
            expect(result.version).toBe(1);
        });

        it('should update existing cache and increment version', async () =>
        {
            // First insert
            await cmsPublishedCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                content: { 'home.title': 'V1' },
                publishedAt: new Date(),
                publishedBy: 'user1',
            });

            // Update
            const updated = await cmsPublishedCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                content: { 'home.title': 'V2' },
                publishedAt: new Date(),
                publishedBy: 'user2',
            });

            expect(updated.content).toEqual({ 'home.title': 'V2' });
            expect(updated.publishedBy).toBe('user2');
            expect(updated.version).toBe(2);
        });

        it('should support multiple locales for same section', async () =>
        {
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

            const ko = await cmsPublishedCacheRepository.findBySection('home', 'ko');
            const en = await cmsPublishedCacheRepository.findBySection('home', 'en');

            expect(ko?.content).toEqual({ 'home.title': '환영합니다' });
            expect(en?.content).toEqual({ 'home.title': 'Welcome' });
        });
    });

    describe('findBySection', () =>
    {
        it('should find cache by section and locale', async () =>
        {
            await cmsPublishedCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                content: { 'home.title': 'Test' },
                publishedAt: new Date(),
                publishedBy: 'test-user',
            });

            const result = await cmsPublishedCacheRepository.findBySection('home', 'ko');

            expect(result).toBeDefined();
            expect(result?.section).toBe('home');
            expect(result?.locale).toBe('ko');
        });

        it('should return null for non-existent section', async () =>
        {
            const result = await cmsPublishedCacheRepository.findBySection('non-existent', 'ko');

            expect(result).toBeNull();
        });

        it('should use default locale ko', async () =>
        {
            await cmsPublishedCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                content: { 'home.title': 'Korean' },
                publishedAt: new Date(),
                publishedBy: 'test-user',
            });

            const result = await cmsPublishedCacheRepository.findBySection('home');

            expect(result?.locale).toBe('ko');
        });
    });

    describe('findAllLanguages', () =>
    {
        it('should find all locales for a section', async () =>
        {
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

            await cmsPublishedCacheRepository.upsert({
                section: 'home',
                locale: 'ja',
                content: { 'home.title': 'ようこそ' },
                publishedAt: new Date(),
                publishedBy: 'test-user',
            });

            const results = await cmsPublishedCacheRepository.findAllLanguages('home');

            expect(results).toHaveLength(3);
            expect(results.map(r => r.locale).sort()).toEqual(['en', 'ja', 'ko']);
        });

        it('should return empty array for section with no cache', async () =>
        {
            const results = await cmsPublishedCacheRepository.findAllLanguages('non-existent');

            expect(results).toEqual([]);
        });
    });

    describe('deleteBySection', () =>
    {
        it('should delete specific locale', async () =>
        {
            await cmsPublishedCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                content: { 'home.title': 'Korean' },
                publishedAt: new Date(),
                publishedBy: 'test-user',
            });

            await cmsPublishedCacheRepository.upsert({
                section: 'home',
                locale: 'en',
                content: { 'home.title': 'English' },
                publishedAt: new Date(),
                publishedBy: 'test-user',
            });

            await cmsPublishedCacheRepository.deleteBySection('home', 'ko');

            const ko = await cmsPublishedCacheRepository.findBySection('home', 'ko');
            const en = await cmsPublishedCacheRepository.findBySection('home', 'en');

            expect(ko).toBeNull();
            expect(en).toBeDefined();
        });

        it('should delete all locales when locale not specified', async () =>
        {
            await cmsPublishedCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                content: { 'home.title': 'Korean' },
                publishedAt: new Date(),
                publishedBy: 'test-user',
            });

            await cmsPublishedCacheRepository.upsert({
                section: 'home',
                locale: 'en',
                content: { 'home.title': 'English' },
                publishedAt: new Date(),
                publishedBy: 'test-user',
            });

            await cmsPublishedCacheRepository.deleteBySection('home');

            const results = await cmsPublishedCacheRepository.findAllLanguages('home');

            expect(results).toEqual([]);
        });
    });

    describe('edge cases', () =>
    {
        it('should handle complex nested content', async () =>
        {
            const complexContent = {
                'home.hero': {
                    title: 'Welcome',
                    subtitle: 'Build faster',
                    cta: {
                        text: 'Get Started',
                        link: '/start',
                    },
                },
                'home.features': [
                    { icon: '⚡', title: 'Fast' },
                    { icon: '🔒', title: 'Secure' },
                ],
            };

            const result = await cmsPublishedCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                content: complexContent,
                publishedAt: new Date(),
                publishedBy: 'test-user',
            });

            expect(result.content).toEqual(complexContent);
        });

        it('should handle special characters in section name', async () =>
        {
            const result = await cmsPublishedCacheRepository.upsert({
                section: 'why-futureplay',
                locale: 'ko',
                content: { 'title': 'Why FuturePlay' },
                publishedAt: new Date(),
                publishedBy: 'test-user',
            });

            expect(result.section).toBe('why-futureplay');
        });
    });
});