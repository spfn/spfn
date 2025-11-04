/**
 * CMS Sync Helper Tests
 *
 * Tests label synchronization functionality
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb } from '@/__tests__/helpers/db';
import { syncSection, syncAll } from '../sync';
import { cmsLabelsRepository, cmsPublishedCacheRepository } from '@/server/repositories';
import type { SectionDefinition } from '@/lib/types';

describe('syncSection', () =>
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

    describe('create labels', () =>
    {
        it('should create new labels from definition', async () =>
        {
            const definition: SectionDefinition = {
                section: 'home',
                labels: {
                    hero: {
                        key: 'home.hero.title',
                        defaultValue: 'Welcome',
                    },
                    subtitle: {
                        key: 'home.hero.subtitle',
                        defaultValue: 'Build faster',
                    },
                },
            };

            const result = await syncSection(definition);

            expect(result.section).toBe('home');
            expect(result.created).toBe(2);
            expect(result.updated).toBe(0);
            expect(result.deleted).toBe(0);
            expect(result.unchanged).toBe(0);
            expect(result.errors).toEqual([]);

            const labels = await cmsLabelsRepository.findBySection('home');
            expect(labels).toHaveLength(2);
        });

        it('should handle multilingual default values', async () =>
        {
            const definition: SectionDefinition = {
                section: 'home',
                labels: {
                    title: {
                        key: 'home.title',
                        defaultValue: {
                            ko: '환영합니다',
                            en: 'Welcome',
                            ja: 'ようこそ',
                        },
                    },
                },
            };

            const result = await syncSection(definition);

            expect(result.created).toBe(1);

            const label = await cmsLabelsRepository.findByKey('home.title');
            expect(label).toBeDefined();
            expect(JSON.parse(label!.defaultValue!)).toEqual({
                ko: '환영합니다',
                en: 'Welcome',
                ja: 'ようこそ',
            });
        });

        it('should create labels with description', async () =>
        {
            const definition: SectionDefinition = {
                section: 'home',
                labels: {
                    hero: {
                        key: 'home.hero.image',
                        defaultValue: '/hero.jpg',
                        description: 'Hero section background image',
                    },
                },
            };

            const result = await syncSection(definition);

            expect(result.created).toBe(1);

            const label = await cmsLabelsRepository.findByKey('home.hero.image');
            expect(label?.type).toBe('text'); // Default type is 'text'
            expect(label?.description).toBe('Hero section background image');
        });

        it('should update published cache after creating labels', async () =>
        {
            const definition: SectionDefinition = {
                section: 'home',
                labels: {
                    title: {
                        key: 'home.title',
                        defaultValue: 'Welcome',
                    },
                },
            };

            await syncSection(definition);

            const cache = await cmsPublishedCacheRepository.findBySection('home', 'ko');
            expect(cache).toBeDefined();
            expect(cache?.content).toHaveProperty('home.title', 'Welcome');
            expect(cache?.publishedBy).toBe('system');
        });
    });

    describe('update labels', () =>
    {
        it('should not update existing labels by default', async () =>
        {
            await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.title',
                type: 'text',
                defaultValue: 'Old Value',
            });

            const definition: SectionDefinition = {
                section: 'home',
                labels: {
                    title: {
                        key: 'home.title',
                        defaultValue: 'New Value',
                    },
                },
            };

            const result = await syncSection(definition);

            expect(result.created).toBe(0);
            expect(result.updated).toBe(0);
            expect(result.unchanged).toBe(1);

            const label = await cmsLabelsRepository.findByKey('home.title');
            expect(label?.defaultValue).toBe('Old Value');
        });

        it('should update existing labels when updateExisting is true', async () =>
        {
            await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.title',
                type: 'text',
                defaultValue: 'Old Value',
            });

            const definition: SectionDefinition = {
                section: 'home',
                labels: {
                    title: {
                        key: 'home.title',
                        defaultValue: 'New Value',
                    },
                },
            };

            const result = await syncSection(definition, { updateExisting: true });

            expect(result.created).toBe(0);
            expect(result.updated).toBe(1);
            expect(result.unchanged).toBe(0);

            const label = await cmsLabelsRepository.findByKey('home.title');
            expect(label?.defaultValue).toBe('New Value');
        });

        it('should not update if value is unchanged', async () =>
        {
            await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.title',
                type: 'text',
                defaultValue: 'Same Value',
            });

            const definition: SectionDefinition = {
                section: 'home',
                labels: {
                    title: {
                        key: 'home.title',
                        defaultValue: 'Same Value',
                    },
                },
            };

            const result = await syncSection(definition, { updateExisting: true });

            expect(result.created).toBe(0);
            expect(result.updated).toBe(0);
            expect(result.unchanged).toBe(1);
        });

        it('should update published cache after updating labels', async () =>
        {
            await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.title',
                type: 'text',
                defaultValue: 'Old Value',
            });

            const definition: SectionDefinition = {
                section: 'home',
                labels: {
                    title: {
                        key: 'home.title',
                        defaultValue: 'New Value',
                    },
                },
            };

            await syncSection(definition, { updateExisting: true });

            const cache = await cmsPublishedCacheRepository.findBySection('home', 'ko');
            expect(cache?.content).toHaveProperty('home.title', 'New Value');
        });
    });

    describe('delete unused labels', () =>
    {
        it('should not delete unused labels by default', async () =>
        {
            await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.old',
                type: 'text',
                defaultValue: 'Old Label',
            });

            const definition: SectionDefinition = {
                section: 'home',
                labels: {
                    title: {
                        key: 'home.title',
                        defaultValue: 'New Label',
                    },
                },
            };

            const result = await syncSection(definition);

            expect(result.deleted).toBe(0);

            const oldLabel = await cmsLabelsRepository.findByKey('home.old');
            expect(oldLabel).toBeDefined();
        });

        it('should delete unused labels when removeUnused is true', async () =>
        {
            await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.old',
                type: 'text',
                defaultValue: 'Old Label',
            });

            const definition: SectionDefinition = {
                section: 'home',
                labels: {
                    title: {
                        key: 'home.title',
                        defaultValue: 'New Label',
                    },
                },
            };

            const result = await syncSection(definition, { removeUnused: true });

            expect(result.created).toBe(1);
            expect(result.deleted).toBe(1);

            const oldLabel = await cmsLabelsRepository.findByKey('home.old');
            expect(oldLabel).toBeNull();
        });

        it('should update published cache after deleting and creating labels', async () =>
        {
            await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.old',
                type: 'text',
                defaultValue: 'Old Label',
            });

            await cmsPublishedCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                content: { 'home.old': 'Old Label' },
                publishedAt: new Date(),
                publishedBy: 'test',
            });

            const definition: SectionDefinition = {
                section: 'home',
                labels: {
                    title: {
                        key: 'home.title',
                        defaultValue: 'New Label',
                    },
                },
            };

            await syncSection(definition, { removeUnused: true });

            const cache = await cmsPublishedCacheRepository.findBySection('home', 'ko');
            expect(cache?.content).toEqual({ 'home.title': 'New Label' });
            expect(cache?.content).not.toHaveProperty('home.old');
        });
    });

    describe('dry run', () =>
    {
        it('should not create labels in dry run mode', async () =>
        {
            const definition: SectionDefinition = {
                section: 'home',
                labels: {
                    title: {
                        key: 'home.title',
                        defaultValue: 'Welcome',
                    },
                },
            };

            const result = await syncSection(definition, { dryRun: true });

            expect(result.created).toBe(1);

            const labels = await cmsLabelsRepository.findBySection('home');
            expect(labels).toHaveLength(0);
        });

        it('should not update labels in dry run mode', async () =>
        {
            await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.title',
                type: 'text',
                defaultValue: 'Old Value',
            });

            const definition: SectionDefinition = {
                section: 'home',
                labels: {
                    title: {
                        key: 'home.title',
                        defaultValue: 'New Value',
                    },
                },
            };

            const result = await syncSection(definition, {
                dryRun: true,
                updateExisting: true,
            });

            expect(result.updated).toBe(1);

            const label = await cmsLabelsRepository.findByKey('home.title');
            expect(label?.defaultValue).toBe('Old Value');
        });

        it('should not delete labels in dry run mode', async () =>
        {
            await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.old',
                type: 'text',
                defaultValue: 'Old Label',
            });

            const definition: SectionDefinition = {
                section: 'home',
                labels: {},
            };

            const result = await syncSection(definition, {
                dryRun: true,
                removeUnused: true,
            });

            expect(result.deleted).toBe(1);

            const label = await cmsLabelsRepository.findByKey('home.old');
            expect(label).toBeDefined();
        });

        it('should not update published cache in dry run mode', async () =>
        {
            const definition: SectionDefinition = {
                section: 'home',
                labels: {
                    title: {
                        key: 'home.title',
                        defaultValue: 'Welcome',
                    },
                },
            };

            await syncSection(definition, { dryRun: true });

            const cache = await cmsPublishedCacheRepository.findBySection('home', 'ko');
            expect(cache).toBeNull();
        });
    });

    describe('error handling', () =>
    {
        it('should handle duplicate key errors gracefully', async () =>
        {
            await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.title',
                type: 'text',
                defaultValue: 'Existing',
            });

            const definition: SectionDefinition = {
                section: 'home',
                labels: {
                    title: {
                        key: 'home.title',
                        defaultValue: 'Duplicate',
                    },
                    other: {
                        key: 'home.other',
                        defaultValue: 'Other Label',
                    },
                },
            };

            const result = await syncSection(definition);

            // Should not attempt to create duplicate
            expect(result.created).toBe(1);
            expect(result.unchanged).toBe(1);
            expect(result.errors).toEqual([]);
        });
    });

    describe('published cache multilingual', () =>
    {
        it('should create cache for multiple locales', async () =>
        {
            const definition: SectionDefinition = {
                section: 'home',
                labels: {
                    title: {
                        key: 'home.title',
                        defaultValue: {
                            ko: '환영합니다',
                            en: 'Welcome',
                            ja: 'ようこそ',
                        },
                    },
                },
            };

            await syncSection(definition);

            const cacheKo = await cmsPublishedCacheRepository.findBySection('home', 'ko');
            const cacheEn = await cmsPublishedCacheRepository.findBySection('home', 'en');
            const cacheJa = await cmsPublishedCacheRepository.findBySection('home', 'ja');

            expect(cacheKo?.content).toHaveProperty('home.title', '환영합니다');
            expect(cacheEn?.content).toHaveProperty('home.title', 'Welcome');
            expect(cacheJa?.content).toHaveProperty('home.title', 'ようこそ');
        });

        it('should handle mixed single and multilingual values', async () =>
        {
            const definition: SectionDefinition = {
                section: 'home',
                labels: {
                    title: {
                        key: 'home.title',
                        defaultValue: {
                            ko: '제목',
                            en: 'Title',
                        },
                    },
                    subtitle: {
                        key: 'home.subtitle',
                        defaultValue: 'Subtitle (shared across locales)',
                    },
                },
            };

            await syncSection(definition);

            const cacheKo = await cmsPublishedCacheRepository.findBySection('home', 'ko');
            const cacheEn = await cmsPublishedCacheRepository.findBySection('home', 'en');

            // 단일 값은 모든 locale에 복사되어야 함
            expect(cacheKo?.content).toEqual({
                'home.title': '제목',
                'home.subtitle': 'Subtitle (shared across locales)',
            });
            expect(cacheEn?.content).toEqual({
                'home.title': 'Title',
                'home.subtitle': 'Subtitle (shared across locales)',
            });
        });

        it('should distribute single values (like image paths) to all locales', async () =>
        {
            const definition: SectionDefinition = {
                section: 'home',
                labels: {
                    title: {
                        key: 'home.companies.1.title',
                        defaultValue: {
                            ko: '처음엔 모든 게 무모해 보였죠',
                            en: 'At first, everything seemed reckless',
                        },
                    },
                    logo: {
                        key: 'home.companies.1.logo',
                        type: 'image',
                        defaultValue: '/companies/soslab-logo.png',
                        description: '회사 로고 이미지 경로',
                    },
                    media: {
                        key: 'home.companies.1.media',
                        type: 'image',
                        defaultValue: '/companies/soslab-media.jpg',
                        description: '회사 미디어 이미지 경로',
                    },
                },
            };

            await syncSection(definition);

            const cacheKo = await cmsPublishedCacheRepository.findBySection('home', 'ko');
            const cacheEn = await cmsPublishedCacheRepository.findBySection('home', 'en');

            // 다국어 객체는 locale별로 분산
            expect(cacheKo?.content['home.companies.1.title']).toBe('처음엔 모든 게 무모해 보였죠');
            expect(cacheEn?.content['home.companies.1.title']).toBe('At first, everything seemed reckless');

            // 단일 값(이미지 경로)은 모든 locale에 복사
            expect(cacheKo?.content['home.companies.1.logo']).toBe('/companies/soslab-logo.png');
            expect(cacheEn?.content['home.companies.1.logo']).toBe('/companies/soslab-logo.png');
            expect(cacheKo?.content['home.companies.1.media']).toBe('/companies/soslab-media.jpg');
            expect(cacheEn?.content['home.companies.1.media']).toBe('/companies/soslab-media.jpg');
        });

        it('should ensure minimum locales (ko, en) when no multilingual values exist', async () =>
        {
            const definition: SectionDefinition = {
                section: 'home',
                labels: {
                    logo: {
                        key: 'home.logo',
                        type: 'image',
                        defaultValue: '/logo.png',
                    },
                },
            };

            await syncSection(definition);

            const cacheKo = await cmsPublishedCacheRepository.findBySection('home', 'ko');
            const cacheEn = await cmsPublishedCacheRepository.findBySection('home', 'en');

            // 다국어 객체가 없어도 기본 locale (ko, en)에 복사
            expect(cacheKo?.content).toEqual({ 'home.logo': '/logo.png' });
            expect(cacheEn?.content).toEqual({ 'home.logo': '/logo.png' });
        });
    });
});

describe('syncAll', () =>
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

    it('should sync multiple sections', async () =>
    {
        const sections: SectionDefinition[] = [
            {
                section: 'home',
                labels: {
                    title: { key: 'home.title', defaultValue: 'Home' },
                },
            },
            {
                section: 'about',
                labels: {
                    title: { key: 'about.title', defaultValue: 'About' },
                },
            },
            {
                section: 'contact',
                labels: {
                    title: { key: 'contact.title', defaultValue: 'Contact' },
                },
            },
        ];

        const results = await syncAll(sections);

        expect(results).toHaveLength(3);
        expect(results[0].section).toBe('home');
        expect(results[0].created).toBe(1);
        expect(results[1].section).toBe('about');
        expect(results[1].created).toBe(1);
        expect(results[2].section).toBe('contact');
        expect(results[2].created).toBe(1);

        const homeLabels = await cmsLabelsRepository.findBySection('home');
        const aboutLabels = await cmsLabelsRepository.findBySection('about');
        const contactLabels = await cmsLabelsRepository.findBySection('contact');

        expect(homeLabels).toHaveLength(1);
        expect(aboutLabels).toHaveLength(1);
        expect(contactLabels).toHaveLength(1);
    });

    it('should sync sections with different options', async () =>
    {
        await cmsLabelsRepository.create({
            section: 'home',
            key: 'home.old',
            type: 'text',
            defaultValue: 'Old',
        });

        const sections: SectionDefinition[] = [
            {
                section: 'home',
                labels: {
                    title: { key: 'home.title', defaultValue: 'Home' },
                },
            },
            {
                section: 'about',
                labels: {
                    title: { key: 'about.title', defaultValue: 'About' },
                },
            },
        ];

        const results = await syncAll(sections, {
            updateExisting: true,
            removeUnused: true,
        });

        expect(results).toHaveLength(2);
        expect(results[0].created).toBe(1);
        expect(results[0].deleted).toBe(1);
        expect(results[1].created).toBe(1);

        const homeLabels = await cmsLabelsRepository.findBySection('home');
        expect(homeLabels).toHaveLength(1);
        expect(homeLabels[0].key).toBe('home.title');
    });

    it('should return empty array for empty sections', async () =>
    {
        const results = await syncAll([]);

        expect(results).toEqual([]);
    });

    it('should handle sections with nested labels', async () =>
    {
        const sections: SectionDefinition[] = [
            {
                section: 'home',
                labels: {
                    hero: {
                        title: {
                            key: 'home.hero.title',
                            defaultValue: 'Welcome',
                        },
                        subtitle: {
                            key: 'home.hero.subtitle',
                            defaultValue: 'Build faster',
                        },
                    },
                    features: {
                        heading: {
                            key: 'home.features.heading',
                            defaultValue: 'Features',
                        },
                    },
                },
            },
        ];

        const results = await syncAll(sections);

        expect(results).toHaveLength(1);
        expect(results[0].created).toBe(3);

        const labels = await cmsLabelsRepository.findBySection('home');
        expect(labels).toHaveLength(3);
    });
});