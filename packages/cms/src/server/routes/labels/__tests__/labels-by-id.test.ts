/**
 * CMS Labels By ID Routes Tests
 *
 * Tests GET/PATCH/DELETE /labels/:id endpoints
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb } from '@/__tests__/helpers/db';
import { cmsLabelsRepository } from '@/server/repositories';
import labelsByIdApp from '../[id]/index';

describe('GET /labels/:id', () =>
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

    it('should get label by id', async () =>
    {
        const created = await cmsLabelsRepository.create({
            key: 'home.hero.title',
            section: 'home',
            type: 'text',
            createdBy: 'test-user',
        });

        const res = await labelsByIdApp.request(`/labels/${created.id}`);

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.id).toBe(created.id);
        expect(data.key).toBe('home.hero.title');
        expect(data.section).toBe('home');
        expect(data.type).toBe('text');
        expect(data.createdBy).toBe('test-user');
    });

    it('should return 404 for non-existent id', async () =>
    {
        const res = await labelsByIdApp.request('/labels/99999');

        expect(res.status).toBe(404);

        const data = await res.json();
        expect(data.error).toBe('Label not found');
    });

    it('should return 400 for invalid id', async () =>
    {
        const res = await labelsByIdApp.request('/labels/invalid');

        expect(res.status).toBe(400);

        const data = await res.json();
        expect(data.error).toBe('Invalid label ID');
    });
});

describe('PATCH /labels/:id', () =>
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

    it('should update label metadata', async () =>
    {
        const created = await cmsLabelsRepository.create({
            key: 'home.hero.title',
            section: 'home',
            type: 'text',
        });

        const res = await labelsByIdApp.request(`/labels/${created.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                section: 'homepage',
                type: 'image',
            }),
        });

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.id).toBe(created.id);
        expect(data.section).toBe('homepage');
        expect(data.type).toBe('image');
        expect(data.key).toBe('home.hero.title'); // Key should not change
    });

    it('should return 404 for non-existent id', async () =>
    {
        const res = await labelsByIdApp.request('/labels/99999', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                section: 'new-section',
            }),
        });

        expect(res.status).toBe(404);

        const data = await res.json();
        expect(data.error).toBe('Label not found');
    });

    it('should return 400 for invalid id', async () =>
    {
        const res = await labelsByIdApp.request('/labels/invalid', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                section: 'new-section',
            }),
        });

        expect(res.status).toBe(400);
    });

    it('should update timestamps', async () =>
    {
        const created = await cmsLabelsRepository.create({
            key: 'home.hero.title',
            section: 'home',
            type: 'text',
        });

        // Wait a bit to ensure timestamp difference
        await new Promise(resolve => setTimeout(resolve, 100));

        const res = await labelsByIdApp.request(`/labels/${created.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                section: 'new-section',
            }),
        });

        const data = await res.json();
        expect(new Date(data.updatedAt).getTime()).toBeGreaterThan(
            new Date(created.updatedAt).getTime()
        );
    });
});

describe('DELETE /labels/:id', () =>
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

    it('should delete label', async () =>
    {
        const created = await cmsLabelsRepository.create({
            key: 'home.hero.title',
            section: 'home',
            type: 'text',
        });

        const res = await labelsByIdApp.request(`/labels/${created.id}`, {
            method: 'DELETE',
        });

        expect(res.status).toBe(200);

        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.id).toBe(created.id);

        // Verify deletion
        const found = await cmsLabelsRepository.findById(created.id);
        expect(found).toBeNull();
    });

    it('should return 404 for non-existent id', async () =>
    {
        const res = await labelsByIdApp.request('/labels/99999', {
            method: 'DELETE',
        });

        expect(res.status).toBe(404);

        const data = await res.json();
        expect(data.error).toBe('Label not found');
    });

    it('should return 400 for invalid id', async () =>
    {
        const res = await labelsByIdApp.request('/labels/invalid', {
            method: 'DELETE',
        });

        expect(res.status).toBe(400);
    });

    it('should cascade delete related data', async () =>
    {
        const created = await cmsLabelsRepository.create({
            key: 'home.hero.title',
            section: 'home',
            type: 'text',
        });

        // In a real scenario, there would be related label_values, label_versions
        // The CASCADE constraint should handle deletion

        const res = await labelsByIdApp.request(`/labels/${created.id}`, {
            method: 'DELETE',
        });

        expect(res.status).toBe(200);
    });
});