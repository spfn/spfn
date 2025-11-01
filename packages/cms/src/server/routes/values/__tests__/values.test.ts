/**
 * CMS Label Values Routes Tests
 *
 * Tests POST /values/:labelId and GET /values/:labelId/:version endpoints
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb } from '@/__tests__/helpers/db';
import { cmsLabelsRepository } from '@/server/repositories';
import valuesApp from '../[labelId]/index';
import valuesDetailApp from '../[labelId]/[version]/index';

describe('POST /values/:labelId', () =>
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

    it('should save label values', async () =>
    {
        const label = await cmsLabelsRepository.create({
            key: 'home.hero.title',
            section: 'home',
            type: 'text',
        });

        const res = await valuesApp.request(`/values/${label.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                version: 1,
                values: [
                    {
                        locale: 'ko',
                        value: {
                            type: 'text',
                            content: '환영합니다',
                        },
                    },
                    {
                        locale: 'en',
                        value: {
                            type: 'text',
                            content: 'Welcome',
                        },
                    },
                ],
            }),
        });

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.saved).toBe(2);
        expect(data.version).toBe(1);
    });

    it('should save values with breakpoints', async () =>
    {
        const label = await cmsLabelsRepository.create({
            key: 'home.hero.image',
            section: 'home',
            type: 'image',
        });

        const res = await valuesApp.request(`/values/${label.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                version: 1,
                values: [
                    {
                        locale: 'ko',
                        breakpoint: 'sm',
                        value: {
                            type: 'image',
                            url: '/images/hero-sm.jpg',
                            width: 640,
                            height: 360,
                        },
                    },
                    {
                        locale: 'ko',
                        breakpoint: 'lg',
                        value: {
                            type: 'image',
                            url: '/images/hero-lg.jpg',
                            width: 1920,
                            height: 1080,
                        },
                    },
                ],
            }),
        });

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.saved).toBe(2);
    });

    it('should upsert values (update existing)', async () =>
    {
        const label = await cmsLabelsRepository.create({
            key: 'home.hero.title',
            section: 'home',
            type: 'text',
        });

        // First save
        await valuesApp.request(`/values/${label.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                version: 1,
                values: [
                    {
                        locale: 'ko',
                        value: {
                            type: 'text',
                            content: 'Version 1',
                        },
                    },
                ],
            }),
        });

        // Update
        const res = await valuesApp.request(`/values/${label.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                version: 1,
                values: [
                    {
                        locale: 'ko',
                        value: {
                            type: 'text',
                            content: 'Version 1 Updated',
                        },
                    },
                ],
            }),
        });

        expect(res.status).toBe(200);
        expect((await res.json()).success).toBe(true);
    });

    it('should return 404 for non-existent label', async () =>
    {
        const res = await valuesApp.request('/values/99999', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                version: 1,
                values: [
                    {
                        locale: 'ko',
                        value: {
                            type: 'text',
                            content: 'Test',
                        },
                    },
                ],
            }),
        });

        expect(res.status).toBe(404);

        const data = await res.json();
        expect(data.error).toBe('Label not found');
    });

    it('should return 400 for invalid label ID', async () =>
    {
        const res = await valuesApp.request('/values/invalid', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                version: 1,
                values: [],
            }),
        });

        expect(res.status).toBe(400);

        const data = await res.json();
        expect(data.error).toBe('Invalid label ID');
    });

    it('should handle multiple value types', async () =>
    {
        const label = await cmsLabelsRepository.create({
            key: 'home.hero.section',
            section: 'home',
            type: 'object',
        });

        const res = await valuesApp.request(`/values/${label.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                version: 1,
                values: [
                    {
                        locale: 'ko',
                        value: {
                            type: 'object',
                            fields: {
                                title: { type: 'text', content: '제목' },
                                image: { type: 'image', url: '/image.jpg', width: 800, height: 600 },
                            },
                        },
                    },
                ],
            }),
        });

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.success).toBe(true);
    });
});

describe('GET /values/:labelId/:version', () =>
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

    it('should get values by label and version', async () =>
    {
        const label = await cmsLabelsRepository.create({
            key: 'home.hero.title',
            section: 'home',
            type: 'text',
        });

        // Save values
        await valuesApp.request(`/values/${label.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                version: 1,
                values: [
                    {
                        locale: 'ko',
                        value: {
                            type: 'text',
                            content: '환영합니다',
                        },
                    },
                ],
            }),
        });

        const res = await valuesDetailApp.request(`/values/${label.id}/1`);

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.labelId).toBe(label.id);
        expect(data.version).toBe(1);
        expect(data.values).toHaveLength(1);
        expect(data.values[0].locale).toBe('ko');
        expect(data.values[0].value.content).toBe('환영합니다');
    });

    it('should filter by locale', async () =>
    {
        const label = await cmsLabelsRepository.create({
            key: 'home.hero.title',
            section: 'home',
            type: 'text',
        });

        // Save values for multiple locales
        await valuesApp.request(`/values/${label.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                version: 1,
                values: [
                    {
                        locale: 'ko',
                        value: {
                            type: 'text',
                            content: '환영합니다',
                        },
                    },
                    {
                        locale: 'en',
                        value: {
                            type: 'text',
                            content: 'Welcome',
                        },
                    },
                ],
            }),
        });

        const res = await valuesDetailApp.request(`/values/${label.id}/1?locale=ko`);

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.values).toHaveLength(1);
        expect(data.values[0].locale).toBe('ko');
    });

    it('should filter by breakpoint', async () =>
    {
        const label = await cmsLabelsRepository.create({
            key: 'home.hero.image',
            section: 'home',
            type: 'image',
        });

        // Save values for multiple breakpoints
        await valuesApp.request(`/values/${label.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                version: 1,
                values: [
                    {
                        locale: 'ko',
                        breakpoint: 'sm',
                        value: {
                            type: 'image',
                            url: '/images/hero-sm.jpg',
                        },
                    },
                    {
                        locale: 'ko',
                        breakpoint: 'lg',
                        value: {
                            type: 'image',
                            url: '/images/hero-lg.jpg',
                        },
                    },
                ],
            }),
        });

        const res = await valuesDetailApp.request(`/values/${label.id}/1?breakpoint=sm`);

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.values).toHaveLength(1);
        expect(data.values[0].breakpoint).toBe('sm');
    });

    it('should return empty array for non-existent version', async () =>
    {
        const label = await cmsLabelsRepository.create({
            key: 'home.hero.title',
            section: 'home',
            type: 'text',
        });

        const res = await valuesDetailApp.request(`/values/${label.id}/999`);

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.values).toEqual([]);
    });

    it('should return 404 for non-existent label', async () =>
    {
        const res = await valuesDetailApp.request('/values/99999/1');

        expect(res.status).toBe(404);

        const data = await res.json();
        expect(data.error).toBe('Label not found');
    });

    it('should return 400 for invalid label ID', async () =>
    {
        const res = await valuesDetailApp.request('/values/invalid/1');

        expect(res.status).toBe(400);

        const data = await res.json();
        expect(data.error).toBe('Invalid label ID or version');
    });

    it('should return 400 for invalid version', async () =>
    {
        const label = await cmsLabelsRepository.create({
            key: 'home.hero.title',
            section: 'home',
            type: 'text',
        });

        const res = await valuesDetailApp.request(`/values/${label.id}/invalid`);

        expect(res.status).toBe(400);

        const data = await res.json();
        expect(data.error).toBe('Invalid label ID or version');
    });
});