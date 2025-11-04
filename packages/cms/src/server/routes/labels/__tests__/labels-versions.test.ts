/**
 * CMS Labels Versions Route Tests
 *
 * Tests GET /labels/:id/versions endpoint
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb } from '@/__tests__/helpers/db';
import { cmsLabelsRepository, cmsLabelValuesRepository } from '@/server/repositories';
import versionsApp from '../[id]/versions/index';

describe('GET /labels/:id/versions', () =>
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

    describe('No published versions', () =>
    {
        it('should return empty array when no published version', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            const res = await versionsApp.request(`/labels/${label.id}/versions`);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.versions).toEqual([]);
        });

        it('should return empty array even with draft values', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            // Create draft (version = null)
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: 'Draft' }
            });

            const res = await versionsApp.request(`/labels/${label.id}/versions`);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.versions).toEqual([]);
        });
    });

    describe('Single version', () =>
    {
        it('should return version 1', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                publishedVersion: 1,
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: 'Version 1' }
            });

            const res = await versionsApp.request(`/labels/${label.id}/versions`);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.versions.length).toBe(1);
            expect(data.versions[0]).toMatchObject({
                version: 1,
                publishedBy: null,
                notes: null,
            });
            expect(data.versions[0].publishedAt).toBeDefined();
            expect(data.versions[0].values.length).toBe(1);
        });

        it('should include all locale values in version', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                publishedVersion: 1,
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: '한국어' }
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'en',
                breakpoint: null,
                value: { type: 'text', content: 'English' }
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ja',
                breakpoint: null,
                value: { type: 'text', content: '日本語' }
            });

            const res = await versionsApp.request(`/labels/${label.id}/versions`);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.versions[0].values.length).toBe(3);

            const locales = data.versions[0].values.map((v: any) => v.locale).sort();
            expect(locales).toEqual(['en', 'ja', 'ko']);
        });

        it('should include all breakpoint values in version', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.image',
                section: 'home',
                type: 'image',
                publishedVersion: 1,
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'image', url: '/desktop.jpg' }
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: 'sm',
                value: { type: 'image', url: '/mobile.jpg' }
            });

            const res = await versionsApp.request(`/labels/${label.id}/versions`);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.versions[0].values.length).toBe(2);

            const breakpoints = data.versions[0].values.map((v: any) => v.breakpoint);
            expect(breakpoints).toContain(null);
            expect(breakpoints).toContain('sm');
        });
    });

    describe('Multiple versions', () =>
    {
        it('should return all versions in descending order', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                publishedVersion: 3,
            });

            // Create 3 versions
            for (let version = 1; version <= 3; version++)
            {
                await cmsLabelValuesRepository.upsert({
                    labelId: label.id,
                    version,
                    locale: 'ko',
                    breakpoint: null,
                    value: { type: 'text', content: `Version ${version}` }
                });
            }

            const res = await versionsApp.request(`/labels/${label.id}/versions`);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.versions.length).toBe(3);

            // Verify descending order (3, 2, 1)
            expect(data.versions[0].version).toBe(3);
            expect(data.versions[1].version).toBe(2);
            expect(data.versions[2].version).toBe(1);
        });

        it('should handle version 10+', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                publishedVersion: 12,
            });

            // Create versions 1-12
            for (let version = 1; version <= 12; version++)
            {
                await cmsLabelValuesRepository.upsert({
                    labelId: label.id,
                    version,
                    locale: 'ko',
                    breakpoint: null,
                    value: { type: 'text', content: `Version ${version}` }
                });
            }

            const res = await versionsApp.request(`/labels/${label.id}/versions`);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.versions.length).toBe(12);

            // Verify descending order
            expect(data.versions[0].version).toBe(12);
            expect(data.versions[11].version).toBe(1);
        });

        it('should show content evolution across versions', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                publishedVersion: 3,
            });

            const contents = [
                'Initial title',
                'Updated title',
                'Final title'
            ];

            for (let version = 1; version <= 3; version++)
            {
                await cmsLabelValuesRepository.upsert({
                    labelId: label.id,
                    version,
                    locale: 'ko',
                    breakpoint: null,
                    value: { type: 'text', content: contents[version - 1] }
                });
            }

            const res = await versionsApp.request(`/labels/${label.id}/versions`);

            expect(res.status).toBe(200);

            const data = await res.json();

            // Version 3 (latest)
            expect(data.versions[0].values[0].value.content).toBe('Final title');

            // Version 2
            expect(data.versions[1].values[0].value.content).toBe('Updated title');

            // Version 1 (oldest)
            expect(data.versions[2].values[0].value.content).toBe('Initial title');
        });
    });

    describe('Version value format', () =>
    {
        it('should return correct value structure', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                publishedVersion: 1,
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: 'md',
                value: { type: 'text', content: 'Test' }
            });

            const res = await versionsApp.request(`/labels/${label.id}/versions`);

            expect(res.status).toBe(200);

            const data = await res.json();
            const valueItem = data.versions[0].values[0];

            expect(valueItem).toHaveProperty('id');
            expect(valueItem).toHaveProperty('locale', 'ko');
            expect(valueItem).toHaveProperty('breakpoint', 'md');
            expect(valueItem).toHaveProperty('value');
            expect(valueItem).toHaveProperty('createdAt');
            expect(valueItem.value).toEqual({ type: 'text', content: 'Test' });
        });

        it('should handle object type values', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.card',
                section: 'home',
                type: 'object',
                publishedVersion: 1,
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: null,
                value: {
                    type: 'object',
                    fields: {
                        title: { type: 'text', content: 'Title' },
                        description: { type: 'text', content: 'Description' }
                    }
                }
            });

            const res = await versionsApp.request(`/labels/${label.id}/versions`);

            expect(res.status).toBe(200);

            const data = await res.json();
            const value = data.versions[0].values[0].value;

            expect(value.type).toBe('object');
            expect(value.fields).toBeDefined();
            expect(value.fields.title).toEqual({ type: 'text', content: 'Title' });
        });

        it('should handle image type values', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.background',
                section: 'home',
                type: 'image',
                publishedVersion: 1,
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: null,
                value: {
                    type: 'image',
                    url: '/background.jpg',
                    alt: 'Background',
                    width: 1920,
                    height: 1080
                }
            });

            const res = await versionsApp.request(`/labels/${label.id}/versions`);

            expect(res.status).toBe(200);

            const data = await res.json();
            const value = data.versions[0].values[0].value;

            expect(value).toMatchObject({
                type: 'image',
                url: '/background.jpg',
                alt: 'Background',
                width: 1920,
                height: 1080
            });
        });
    });

    describe('Error handling', () =>
    {
        it('should return 404 for non-existent label', async () =>
        {
            const res = await versionsApp.request('/labels/99999/versions');

            expect(res.status).toBe(404);

            const data = await res.json();
            expect(data.error).toBe('Label not found');
        });

        it('should return 500 for invalid label ID', async () =>
        {
            const res = await versionsApp.request('/labels/invalid/versions');

            expect(res.status).toBeGreaterThanOrEqual(400);
        });
    });

    describe('Edge cases', () =>
    {
        it('should handle missing version values gracefully', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                publishedVersion: 3,
            });

            // Create only version 1 and 3 (skip version 2)
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: 'Version 1' }
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 3,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: 'Version 3' }
            });

            const res = await versionsApp.request(`/labels/${label.id}/versions`);

            expect(res.status).toBe(200);

            const data = await res.json();
            // Should only return versions with actual values (1 and 3)
            expect(data.versions.length).toBe(2);

            const versions = data.versions.map((v: any) => v.version).sort((a: number, b: number) => a - b);
            expect(versions).toEqual([1, 3]);
        });

        it('should handle version with empty locale values', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                publishedVersion: 1,
            });

            // Create version but with no actual values (edge case)
            // This shouldn't normally happen, but test defensive coding

            const res = await versionsApp.request(`/labels/${label.id}/versions`);

            expect(res.status).toBe(200);

            const data = await res.json();
            // If no values exist for version 1, it should be excluded
            expect(data.versions).toEqual([]);
        });
    });

    describe('Complex scenarios', () =>
    {
        it('should handle multi-locale evolution across versions', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                publishedVersion: 2,
            });

            // Version 1: Only Korean
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: 'Korean v1' }
            });

            // Version 2: Korean + English
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 2,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: 'Korean v2' }
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 2,
                locale: 'en',
                breakpoint: null,
                value: { type: 'text', content: 'English v2' }
            });

            const res = await versionsApp.request(`/labels/${label.id}/versions`);

            expect(res.status).toBe(200);

            const data = await res.json();

            // Version 2 should have 2 locales
            expect(data.versions[0].version).toBe(2);
            expect(data.versions[0].values.length).toBe(2);

            // Version 1 should have 1 locale
            expect(data.versions[1].version).toBe(1);
            expect(data.versions[1].values.length).toBe(1);
        });

        it('should track breakpoint changes across versions', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.image',
                section: 'home',
                type: 'image',
                publishedVersion: 3,
            });

            // Version 1: Default only
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'image', url: '/v1-default.jpg' }
            });

            // Version 2: Default + Mobile
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 2,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'image', url: '/v2-default.jpg' }
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 2,
                locale: 'ko',
                breakpoint: 'sm',
                value: { type: 'image', url: '/v2-mobile.jpg' }
            });

            // Version 3: Default + Mobile + Tablet
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 3,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'image', url: '/v3-default.jpg' }
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 3,
                locale: 'ko',
                breakpoint: 'sm',
                value: { type: 'image', url: '/v3-mobile.jpg' }
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 3,
                locale: 'ko',
                breakpoint: 'md',
                value: { type: 'image', url: '/v3-tablet.jpg' }
            });

            const res = await versionsApp.request(`/labels/${label.id}/versions`);

            expect(res.status).toBe(200);

            const data = await res.json();

            // Verify evolution
            expect(data.versions[0].values.length).toBe(3); // v3: 3 breakpoints
            expect(data.versions[1].values.length).toBe(2); // v2: 2 breakpoints
            expect(data.versions[2].values.length).toBe(1); // v1: 1 breakpoint
        });
    });
});