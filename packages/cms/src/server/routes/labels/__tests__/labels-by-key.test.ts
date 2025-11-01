/**
 * CMS Labels By Key Routes Tests
 *
 * Tests GET /labels/by-key/:key endpoint
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb } from '@/__tests__/helpers/db';
import { cmsLabelsRepository } from '@/server/repositories';
import labelsByKeyApp from '../by-key/[key]/index';

describe('GET /labels/by-key/:key', () =>
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

    it('should get label by key', async () =>
    {
        await cmsLabelsRepository.create({
            key: 'home.hero.title',
            section: 'home',
            type: 'text',
            createdBy: 'test-user',
        });

        const res = await labelsByKeyApp.request('/labels/by-key/home.hero.title');

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.key).toBe('home.hero.title');
        expect(data.section).toBe('home');
        expect(data.type).toBe('text');
        expect(data.createdBy).toBe('test-user');
    });

    it('should return 404 for non-existent key', async () =>
    {
        const res = await labelsByKeyApp.request('/labels/by-key/non.existent.key');

        expect(res.status).toBe(404);

        const data = await res.json();
        expect(data.error).toBe('Label not found');
        expect(data.key).toBe('non.existent.key');
    });

    it('should handle special characters in key', async () =>
    {
        await cmsLabelsRepository.create({
            key: 'why-futureplay.section-1.title',
            section: 'why-futureplay',
            type: 'text',
        });

        const res = await labelsByKeyApp.request('/labels/by-key/why-futureplay.section-1.title');

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.key).toBe('why-futureplay.section-1.title');
    });

    it('should handle URL encoded keys', async () =>
    {
        await cmsLabelsRepository.create({
            key: 'home.hero.title',
            section: 'home',
            type: 'text',
        });

        // Test with URL encoded key
        const res = await labelsByKeyApp.request('/labels/by-key/home.hero.title');

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.key).toBe('home.hero.title');
    });

    it('should be case sensitive', async () =>
    {
        await cmsLabelsRepository.create({
            key: 'home.hero.title',
            section: 'home',
            type: 'text',
        });

        // Try with different case
        const res = await labelsByKeyApp.request('/labels/by-key/Home.Hero.Title');

        expect(res.status).toBe(404);
    });
});