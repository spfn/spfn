/**
 * @spfn/cms - Labels Route Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb } from '@/__tests__/helpers/db';
import { cmsLabels } from '@/server/entities';
import app from '../index';

describe('Labels Routes', () =>
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

    describe('GET /labels', () =>
    {
        it('should return empty list when no labels exist', async () =>
        {
            const req = new Request('http://localhost/labels',
                {
                    method: 'GET',
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.labels).toEqual([]);
            expect(data.total).toBe(0);
            expect(data.limit).toBe(20);
            expect(data.offset).toBe(0);
        });

        it('should return list of labels', async () =>
        {
            const db = getTestDb();

            // Create test labels
            await db.insert(cmsLabels).values([
                {
                    key: 'home.hero.title',
                    section: 'home',
                    type: 'text',
                    createdBy: 'test@example.com',
                },
                {
                    key: 'home.hero.subtitle',
                    section: 'home',
                    type: 'text',
                    createdBy: 'test@example.com',
                },
                {
                    key: 'about.hero.image',
                    section: 'about',
                    type: 'image',
                    createdBy: 'test@example.com',
                },
            ]);

            const req = new Request('http://localhost/labels',
                {
                    method: 'GET',
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.labels).toHaveLength(3);
            expect(data.total).toBe(3);
            expect(data.labels[0]).toHaveProperty('id');
            expect(data.labels[0]).toHaveProperty('key');
            expect(data.labels[0]).toHaveProperty('section');
            expect(data.labels[0]).toHaveProperty('type');
            expect(data.labels[0]).toHaveProperty('createdAt');
            expect(data.labels[0]).toHaveProperty('updatedAt');
        });

        it('should filter labels by section', async () =>
        {
            const db = getTestDb();

            // Create test labels
            await db.insert(cmsLabels).values([
                {
                    key: 'home.hero.title',
                    section: 'home',
                    type: 'text',
                },
                {
                    key: 'home.hero.subtitle',
                    section: 'home',
                    type: 'text',
                },
                {
                    key: 'about.hero.title',
                    section: 'about',
                    type: 'text',
                },
            ]);

            const req = new Request('http://localhost/labels?section=home',
                {
                    method: 'GET',
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.labels).toHaveLength(2);
            expect(data.total).toBe(2);
            expect(data.labels.every((label: any) => label.section === 'home')).toBe(true);
        });

        it('should support pagination with limit and offset', async () =>
        {
            const db = getTestDb();

            // Create 25 test labels
            const labels = Array.from({ length: 25 }, (_, i) => ({
                key: `test.label.${i}`,
                section: 'test',
                type: 'text',
            }));
            await db.insert(cmsLabels).values(labels);

            // First page
            const req1 = new Request('http://localhost/labels?limit=10&offset=0',
                {
                    method: 'GET',
                }
            );
            const res1 = await app.fetch(req1);
            const data1 = await res1.json();

            expect(res1.status).toBe(200);
            expect(data1.labels).toHaveLength(10);
            expect(data1.total).toBe(25);
            expect(data1.limit).toBe(10);
            expect(data1.offset).toBe(0);

            // Second page
            const req2 = new Request('http://localhost/labels?limit=10&offset=10',
                {
                    method: 'GET',
                }
            );
            const res2 = await app.fetch(req2);
            const data2 = await res2.json();

            expect(res2.status).toBe(200);
            expect(data2.labels).toHaveLength(10);
            expect(data2.total).toBe(25);
            expect(data2.offset).toBe(10);

            // Third page
            const req3 = new Request('http://localhost/labels?limit=10&offset=20',
                {
                    method: 'GET',
                }
            );
            const res3 = await app.fetch(req3);
            const data3 = await res3.json();

            expect(res3.status).toBe(200);
            expect(data3.labels).toHaveLength(5);
            expect(data3.total).toBe(25);
        });
    });

    describe('POST /labels', () =>
    {
        it('should create a new label', async () =>
        {
            const req = new Request('http://localhost/labels',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key: 'home.hero.title',
                        section: 'home',
                        type: 'text',
                        createdBy: 'test@example.com',
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            expect(res.status).toBe(201);
            expect(data.id).toBeDefined();
            expect(data.key).toBe('home.hero.title');
            expect(data.section).toBe('home');
            expect(data.type).toBe('text');
            expect(data.publishedVersion).toBeNull();
            expect(data.createdBy).toBe('test@example.com');
            expect(data.createdAt).toBeDefined();
            expect(data.updatedAt).toBeDefined();
        });

        it('should create labels with different types', async () =>
        {
            const types = ['text', 'image', 'video', 'file', 'object'];

            for (const type of types)
            {
                const req = new Request('http://localhost/labels',
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            key: `test.${type}.value`,
                            section: 'test',
                            type,
                        }),
                    }
                );

                const res = await app.fetch(req);
                const data = await res.json();

                expect(res.status).toBe(201);
                expect(data.type).toBe(type);
            }
        });

        it('should return 409 when key already exists', async () =>
        {
            const db = getTestDb();

            // Create existing label
            await db.insert(cmsLabels).values({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            // Try to create duplicate
            const req = new Request('http://localhost/labels',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key: 'home.hero.title',
                        section: 'home',
                        type: 'text',
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            expect(res.status).toBe(409);
            expect(data.error).toBe('Label with this key already exists');
            expect(data.key).toBe('home.hero.title');
        });

        it('should return 400 for invalid key format', async () =>
        {
            const req = new Request('http://localhost/labels',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key: 'invalid_key',
                        section: 'home',
                        type: 'text',
                    }),
                }
            );

            const res = await app.fetch(req);

            expect(res.status).toBe(400);
        });

        it('should return 400 for invalid section format', async () =>
        {
            const req = new Request('http://localhost/labels',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key: 'home.hero.title',
                        section: 'Invalid_Section',
                        type: 'text',
                    }),
                }
            );

            const res = await app.fetch(req);

            expect(res.status).toBe(400);
        });

        it('should return 400 for invalid type', async () =>
        {
            const req = new Request('http://localhost/labels',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key: 'home.hero.title',
                        section: 'home',
                        type: 'invalid-type',
                    }),
                }
            );

            const res = await app.fetch(req);

            expect(res.status).toBe(400);
        });

        it('should return 400 when required fields are missing', async () =>
        {
            // Missing key
            const req1 = new Request('http://localhost/labels',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        section: 'home',
                        type: 'text',
                    }),
                }
            );
            const res1 = await app.fetch(req1);
            expect(res1.status).toBe(400);

            // Missing section
            const req2 = new Request('http://localhost/labels',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key: 'home.hero.title',
                        type: 'text',
                    }),
                }
            );
            const res2 = await app.fetch(req2);
            expect(res2.status).toBe(400);

            // Missing type
            const req3 = new Request('http://localhost/labels',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        key: 'home.hero.title',
                        section: 'home',
                    }),
                }
            );
            const res3 = await app.fetch(req3);
            expect(res3.status).toBe(400);
        });
    });
});
