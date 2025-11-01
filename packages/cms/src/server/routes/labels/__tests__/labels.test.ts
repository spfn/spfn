/**
 * CMS Labels Routes Tests
 *
 * Tests POST /labels and GET /labels endpoints
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb } from '@/__tests__/helpers/db';
import { cmsLabelsRepository } from '@/server/repositories';
import labelsApp from '../index';

describe('POST /labels', () =>
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

    it('should create a new label', async () =>
    {
        const res = await labelsApp.request('/labels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
                createdBy: 'test-user',
            }),
        });

        expect(res.status).toBe(201);

        const data = await res.json();
        expect(data.id).toBeDefined();
        expect(data.key).toBe('home.hero.title');
        expect(data.section).toBe('home');
        expect(data.type).toBe('text');
        expect(data.createdBy).toBe('test-user');
        expect(data.createdAt).toBeDefined();
        expect(data.updatedAt).toBeDefined();
    });

    it('should reject duplicate key', async () =>
    {
        await cmsLabelsRepository.create({
            key: 'home.hero.title',
            section: 'home',
            type: 'text',
        });

        const res = await labelsApp.request('/labels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            }),
        });

        expect(res.status).toBe(409);

        const data = await res.json();
        expect(data.error).toBeDefined();
        expect(data.key).toBe('home.hero.title');
    });

    it('should validate request body', async () =>
    {
        const res = await labelsApp.request('/labels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key: 'invalid-key', // Invalid format (needs section.subsection.name)
                section: 'home',
                type: 'text',
            }),
        });

        expect(res.status).toBe(400);
    });
});

describe('GET /labels', () =>
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

    it('should return empty list when no labels exist', async () =>
    {
        const res = await labelsApp.request('/labels');

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.labels).toEqual([]);
        expect(data.total).toBe(0);
        expect(data.limit).toBe(20);
        expect(data.offset).toBe(0);
    });

    it('should return all labels with pagination', async () =>
    {
        // Create test data
        for (let i = 0; i < 15; i++)
        {
            await cmsLabelsRepository.create({
                key: `home.label${i}.title`,
                section: 'home',
                type: 'text',
            });
        }

        const res = await labelsApp.request('/labels?limit=10&offset=0');

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.labels).toHaveLength(10);
        expect(data.total).toBe(15);
        expect(data.limit).toBe(10);
        expect(data.offset).toBe(0);
    });

    it('should filter by section', async () =>
    {
        await cmsLabelsRepository.create({
            key: 'home.hero.title',
            section: 'home',
            type: 'text',
        });

        await cmsLabelsRepository.create({
            key: 'about.intro.title',
            section: 'about',
            type: 'text',
        });

        const res = await labelsApp.request('/labels?section=home');

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.labels).toHaveLength(1);
        expect(data.labels[0].section).toBe('home');
        expect(data.total).toBe(1);
    });

    it('should handle pagination correctly', async () =>
    {
        // Create 25 labels
        for (let i = 0; i < 25; i++)
        {
            await cmsLabelsRepository.create({
                key: `test.label${i}.title`,
                section: 'test',
                type: 'text',
            });
        }

        // Get second page
        const res = await labelsApp.request('/labels?limit=10&offset=10');

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.labels).toHaveLength(10);
        expect(data.offset).toBe(10);

        // Get third page
        const res3 = await labelsApp.request('/labels?limit=10&offset=20');
        const data3 = await res3.json();
        expect(data3.labels).toHaveLength(5);
    });

    it('should reject invalid query parameters', async () =>
    {
        const res = await labelsApp.request('/labels?section=&limit=&offset=');

        // Empty string values for numeric parameters should be rejected
        expect(res.status).toBe(400);
    });

    it('should reject very large limit values', async () =>
    {
        const res = await labelsApp.request('/labels?limit=1000');

        // Should be rejected by contract validation
        expect(res.status).toBe(400);
    });

    it('should reject negative offset', async () =>
    {
        const res = await labelsApp.request('/labels?offset=-1');

        // Should be rejected by contract validation
        expect(res.status).toBe(400);
    });
});

describe('Edge Cases', () =>
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

    it('should handle concurrent requests', async () =>
    {
        const promises = [];

        for (let i = 0; i < 10; i++)
        {
            promises.push(
                labelsApp.request('/labels', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key: `test.concurrent${i}.title`,
                        section: 'test',
                        type: 'text',
                    }),
                })
            );
        }

        const results = await Promise.all(promises);

        // All should succeed
        results.forEach(res =>
        {
            expect(res.status).toBe(201);
        });

        // Verify all were created
        const listRes = await labelsApp.request('/labels');
        const listData = await listRes.json();
        expect(listData.total).toBe(10);
    });
});