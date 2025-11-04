/**
 * CMS Labels Admin Route Tests
 *
 * Tests GET /labels/:id/admin endpoint and status calculation logic
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb } from '@/__tests__/helpers/db';
import { cmsLabelsRepository, cmsLabelValuesRepository } from '@/server/repositories';
import adminApp from '../[id]/admin/index';

describe('GET /labels/:id/admin', () =>
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

    describe('Status: default-only', () =>
    {
        it('should return default-only status when no draft and no published', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            const res = await adminApp.request(`/labels/${label.id}/admin`);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.status).toBe('default-only');
            expect(data.draft).toEqual([]);
            expect(data.published).toEqual([]);
        });
    });

    describe('Status: unpublished', () =>
    {
        it('should return unpublished status when has draft but no published', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            // Create draft value (version = null)
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: 'Draft content' }
            });

            const res = await adminApp.request(`/labels/${label.id}/admin`);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.status).toBe('unpublished');
            expect(data.draft.length).toBe(1);
            expect(data.published).toEqual([]);
        });
    });

    describe('Status: published', () =>
    {
        it('should return published status when has published but no draft', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                publishedVersion: 1,
            });

            // Create published value (version = 1)
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: 'Published content' }
            });

            const res = await adminApp.request(`/labels/${label.id}/admin`);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.status).toBe('published');
            expect(data.draft).toEqual([]);
            expect(data.published.length).toBe(1);
        });

        it('should return published status when draft equals published', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                publishedVersion: 1,
            });

            const sameValue = { type: 'text', content: 'Same content' };

            // Create draft value
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: null,
                value: sameValue
            });

            // Create published value with exact same content
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: null,
                value: sameValue
            });

            const res = await adminApp.request(`/labels/${label.id}/admin`);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.status).toBe('published');
            expect(data.draft.length).toBe(1);
            expect(data.published.length).toBe(1);
        });
    });

    describe('Status: modified', () =>
    {
        it('should return modified status when draft differs from published', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                publishedVersion: 1,
            });

            // Create draft value
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: 'Draft content' }
            });

            // Create published value with different content
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'text', content: 'Published content' }
            });

            const res = await adminApp.request(`/labels/${label.id}/admin`);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.status).toBe('modified');
            expect(data.draft.length).toBe(1);
            expect(data.published.length).toBe(1);
        });

        it('should return modified when draft has additional locale', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                publishedVersion: 1,
            });

            const value = { type: 'text', content: 'Content' };

            // Draft has ko + en
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: null,
                value
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'en',
                breakpoint: null,
                value
            });

            // Published has only ko
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: null,
                value
            });

            const res = await adminApp.request(`/labels/${label.id}/admin`);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.status).toBe('modified');
            expect(data.draft.length).toBe(2);
            expect(data.published.length).toBe(1);
        });

        it('should return modified when breakpoint differs', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                publishedVersion: 1,
            });

            const value = { type: 'text', content: 'Content' };

            // Draft has default + sm breakpoint
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: null,
                value
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: 'sm',
                value
            });

            // Published has only default
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: null,
                value
            });

            const res = await adminApp.request(`/labels/${label.id}/admin`);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.status).toBe('modified');
        });

        it('should detect nested object changes', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.card',
                section: 'home',
                type: 'object',
                publishedVersion: 1,
            });

            // Draft with nested object
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: null,
                value: {
                    type: 'object',
                    fields: {
                        title: { type: 'text', content: 'New Title' },
                        description: { type: 'text', content: 'Description' }
                    }
                }
            });

            // Published with different nested content
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: null,
                value: {
                    type: 'object',
                    fields: {
                        title: { type: 'text', content: 'Old Title' },
                        description: { type: 'text', content: 'Description' }
                    }
                }
            });

            const res = await adminApp.request(`/labels/${label.id}/admin`);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.status).toBe('modified');
        });
    });

    describe('Response format', () =>
    {
        it('should return complete label metadata', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                description: 'Hero title',
                createdBy: 'admin@example.com',
            });

            const res = await adminApp.request(`/labels/${label.id}/admin`);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.label).toMatchObject({
                id: label.id,
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                description: 'Hero title',
                publishedVersion: null,
                createdBy: 'admin@example.com',
            });
            expect(data.label.createdAt).toBeDefined();
            expect(data.label.updatedAt).toBeDefined();
        });

        it('should return draft values with correct format', async () =>
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
                breakpoint: 'md',
                value: { type: 'text', content: 'Test' }
            });

            const res = await adminApp.request(`/labels/${label.id}/admin`);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.draft[0]).toMatchObject({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: 'md',
                value: { type: 'text', content: 'Test' }
            });
            expect(data.draft[0].id).toBeDefined();
            expect(data.draft[0].createdAt).toBeDefined();
        });

        it('should return published values with correct format', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                publishedVersion: 2,
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 2,
                locale: 'en',
                breakpoint: null,
                value: { type: 'text', content: 'Published' }
            });

            const res = await adminApp.request(`/labels/${label.id}/admin`);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.published[0]).toMatchObject({
                labelId: label.id,
                version: 2,
                locale: 'en',
                breakpoint: null,
                value: { type: 'text', content: 'Published' }
            });
        });
    });

    describe('Error handling', () =>
    {
        it('should return 404 for non-existent label', async () =>
        {
            const res = await adminApp.request('/labels/99999/admin');

            expect(res.status).toBe(404);

            const data = await res.json();
            expect(data.error).toBe('Label not found');
        });

        it('should handle database errors gracefully', async () =>
        {
            // Test with invalid ID format
            const res = await adminApp.request('/labels/invalid/admin');

            expect(res.status).toBeGreaterThanOrEqual(400);
        });
    });

    describe('Multi-locale and breakpoint combinations', () =>
    {
        it('should handle multiple locales and breakpoints correctly', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.image',
                section: 'home',
                type: 'image',
                publishedVersion: 1,
            });

            // Draft: ko (default, sm), en (default)
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'image', url: '/ko-desktop.jpg' }
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                breakpoint: 'sm',
                value: { type: 'image', url: '/ko-mobile.jpg' }
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'en',
                breakpoint: null,
                value: { type: 'image', url: '/en-desktop.jpg' }
            });

            // Published: ko (default, sm), en (default)
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: null,
                value: { type: 'image', url: '/ko-desktop.jpg' }
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: 'sm',
                value: { type: 'image', url: '/ko-mobile.jpg' }
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'en',
                breakpoint: null,
                value: { type: 'image', url: '/en-desktop.jpg' }
            });

            const res = await adminApp.request(`/labels/${label.id}/admin`);

            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.status).toBe('published'); // All match
            expect(data.draft.length).toBe(3);
            expect(data.published.length).toBe(3);
        });
    });
});