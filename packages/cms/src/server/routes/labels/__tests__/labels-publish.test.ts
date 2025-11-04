/**
 * CMS Labels Publish Route Tests
 *
 * Tests POST /labels/:id/publish endpoint
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb } from '@/__tests__/helpers/db';
import { cmsLabelsRepository, cmsLabelValuesRepository, cmsPublishedCacheRepository } from '@/server/repositories';
import publishApp from '../[id]/publish/index';

describe('POST /labels/:id/publish', () =>
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

    describe('First publish (version 1)', () =>
    {
        it('should publish draft to version 1', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            // Create draft value
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: 'Draft content' }
            });

            const res = await publishApp.request(`/labels/${label.id}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    notes: 'Initial publish',
                    publishedBy: 'admin@example.com'
                })
            });

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.success).toBe(true);
            expect(data.id).toBe(label.id);
            expect(data.version).toBe(1);
            expect(data.message).toContain('version 1');

            // Verify publishedVersion updated
            const updated = await cmsLabelsRepository.findById(label.id);
            expect(updated?.publishedVersion).toBe(1);

            // Verify published value created
            const publishedValues = await cmsLabelValuesRepository.findByLabelIdAndVersion(
                label.id,
                1
            );
            expect(publishedValues.length).toBe(1);
            expect(publishedValues[0].value).toEqual({ type: 'text', content: 'Draft content' });
        });

        it('should publish multiple locales', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            // Create draft values for multiple locales
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: '한국어 내용' }
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'en',
                breakpoint: null,
                value: { type: 'text', content: 'English content' }
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ja',
                breakpoint: null,
                value: { type: 'text', content: '日本語コンテンツ' }
            });

            const res = await publishApp.request(`/labels/${label.id}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.version).toBe(1);

            // Verify all locales published
            const publishedValues = await cmsLabelValuesRepository.findByLabelIdAndVersion(
                label.id,
                1
            );
            expect(publishedValues.length).toBe(3);

            const locales = publishedValues.map(v => v.locale).sort();
            expect(locales).toEqual(['en', 'ja', 'ko']);
        });

        it('should publish multiple breakpoints', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.image',
                section: 'home',
                type: 'image',
            });

            // Create draft values for multiple breakpoints
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'image', url: '/desktop.jpg' }
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: 'sm',
                value: { type: 'image', url: '/mobile.jpg' }
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: 'md',
                value: { type: 'image', url: '/tablet.jpg' }
            });

            const res = await publishApp.request(`/labels/${label.id}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            expect(res.status).toBe(200);

            // Verify all breakpoints published
            const publishedValues = await cmsLabelValuesRepository.findByLabelIdAndVersion(
                label.id,
                1
            );
            expect(publishedValues.length).toBe(3);
        });
    });

    describe('Subsequent publishes (version 2+)', () =>
    {
        it('should increment version number', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                publishedVersion: 1,
            });

            // Create v1 published value
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: 'Version 1' }
            });

            // Create new draft
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: 'Version 2' }
            });

            const res = await publishApp.request(`/labels/${label.id}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.version).toBe(2);

            // Verify publishedVersion updated
            const updated = await cmsLabelsRepository.findById(label.id);
            expect(updated?.publishedVersion).toBe(2);

            // Verify both versions exist
            const v1 = await cmsLabelValuesRepository.findByLabelIdAndVersion(label.id, 1);
            const v2 = await cmsLabelValuesRepository.findByLabelIdAndVersion(label.id, 2);

            expect(v1.length).toBe(1);
            expect(v2.length).toBe(1);
            expect(v1[0].value).toEqual({ type: 'text', content: 'Version 1' });
            expect(v2[0].value).toEqual({ type: 'text', content: 'Version 2' });
        });

        it('should handle version 5 correctly', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                publishedVersion: 4,
            });

            // Create draft
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: 'Version 5' }
            });

            const res = await publishApp.request(`/labels/${label.id}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.version).toBe(5);
        });
    });

    describe('Published cache update', () =>
    {
        it('should update published cache after publish', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: 'Published content' }
            });

            const res = await publishApp.request(`/labels/${label.id}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ publishedBy: 'admin@test.com' })
            });

            expect(res.status).toBe(200);

            // Verify published cache updated
            const cache = await cmsPublishedCacheRepository.findBySection('home', 'ko');
            expect(cache).toBeDefined();
            expect(cache?.content['home.hero.title']).toBeDefined();
        });

        it('should update cache for all supported locales', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            // Create drafts for multiple locales
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: 'Korean' }
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'en',
                breakpoint: null,
                value: { type: 'text', content: 'English' }
            });

            const res = await publishApp.request(`/labels/${label.id}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            expect(res.status).toBe(200);

            // Verify cache updated for all locales
            const koCache = await cmsPublishedCacheRepository.findBySection('home', 'ko');
            const enCache = await cmsPublishedCacheRepository.findBySection('home', 'en');

            expect(koCache?.content['home.hero.title']).toBeDefined();
            expect(enCache?.content['home.hero.title']).toBeDefined();
        });
    });

    describe('Error handling', () =>
    {
        it('should return 400 when label not found', async () =>
        {
            const res = await publishApp.request('/labels/99999/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            expect(res.status).toBe(400);

            const data = await res.json();
            expect(data.error).toContain('not found');
        });

        it('should return 400 when no draft values exist', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            // No draft values created

            const res = await publishApp.request(`/labels/${label.id}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            expect(res.status).toBe(400);

            const data = await res.json();
            expect(data.error).toContain('No draft values');
        });

        it('should handle invalid label ID', async () =>
        {
            const res = await publishApp.request('/labels/invalid/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            expect(res.status).toBe(400);
        });
    });

    describe('Optional parameters', () =>
    {
        it('should work without notes and publishedBy', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: 'Content' }
            });

            const res = await publishApp.request(`/labels/${label.id}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.success).toBe(true);
        });

        it('should accept notes parameter', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: 'Content' }
            });

            const res = await publishApp.request(`/labels/${label.id}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    notes: 'Updated hero title text',
                    publishedBy: 'admin@example.com'
                })
            });

            expect(res.status).toBe(200);
        });
    });

    describe('Complex scenarios', () =>
    {
        it('should handle publishing with object type values', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.card',
                section: 'home',
                type: 'object',
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: null,
                value: {
                    type: 'object',
                    fields: {
                        title: { type: 'text', content: 'Card Title' },
                        description: { type: 'text', content: 'Card Description' },
                        image: { type: 'image', url: '/card.jpg' }
                    }
                }
            });

            const res = await publishApp.request(`/labels/${label.id}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.version).toBe(1);

            // Verify nested object preserved
            const published = await cmsLabelValuesRepository.findByLabelIdAndVersion(label.id, 1);
            expect(published[0].value).toHaveProperty('type', 'object');
            expect(published[0].value).toHaveProperty('fields');
        });

        it('should handle multi-locale, multi-breakpoint publish', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.image',
                section: 'home',
                type: 'image',
            });

            // Create 6 draft combinations (2 locales × 3 breakpoints)
            const combinations = [
                { locale: 'ko', breakpoint: null, url: '/ko-desktop.jpg' },
                { locale: 'ko', breakpoint: 'sm', url: '/ko-mobile.jpg' },
                { locale: 'ko', breakpoint: 'md', url: '/ko-tablet.jpg' },
                { locale: 'en', breakpoint: null, url: '/en-desktop.jpg' },
                { locale: 'en', breakpoint: 'sm', url: '/en-mobile.jpg' },
                { locale: 'en', breakpoint: 'md', url: '/en-tablet.jpg' },
            ];

            for (const combo of combinations)
            {
                await cmsLabelValuesRepository.upsert({
                    labelId: label.id,
                    version: null,
                    locale: combo.locale,
                    breakpoint: combo.breakpoint,
                    value: { type: 'image', url: combo.url }
                });
            }

            const res = await publishApp.request(`/labels/${label.id}/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            expect(res.status).toBe(200);

            // Verify all 6 combinations published
            const published = await cmsLabelValuesRepository.findByLabelIdAndVersion(label.id, 1);
            expect(published.length).toBe(6);

            // Verify each combination
            for (const combo of combinations)
            {
                const found = published.find(
                    p => p.locale === combo.locale && p.breakpoint === combo.breakpoint
                );
                expect(found).toBeDefined();
                expect(found?.value).toEqual({ type: 'image', url: combo.url });
            }
        });
    });
});