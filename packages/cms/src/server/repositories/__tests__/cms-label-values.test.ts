/**
 * CMS Label Values Repository Tests
 *
 * Tests label values CRUD operations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb } from '@/__tests__/helpers/db';
import { cmsLabelsRepository } from '../cms-labels.repository';
import { cmsLabelValuesRepository } from '../cms-label-values.repository';

describe('CmsLabelValuesRepository', () =>
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
        it('should create new label value', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            const result = await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                value: { type: 'text', content: '환영합니다' },
            });

            expect(result.id).toBeDefined();
            expect(result.labelId).toBe(label.id);
            expect(result.version).toBe(1);
            expect(result.locale).toBe('ko');
            expect(result.value).toEqual({ type: 'text', content: '환영합니다' });
        });

        it('should update an existing draft value', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            // First insert
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                value: { type: 'text', content: 'V1' },
            });

            // Update
            const updated = await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                value: { type: 'text', content: 'V2' },
            });

            expect(updated.value).toEqual({ type: 'text', content: 'V2' });

            // Verify only one record exists
            const values = await cmsLabelValuesRepository.findDraftsByLabelId(label.id);
            expect(values).toHaveLength(1);
        });

        it('should support different locales', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                value: { type: 'text', content: '환영합니다' },
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'en',
                value: { type: 'text', content: 'Welcome' },
            });

            const values = await cmsLabelValuesRepository.findByLabelIdAndVersion(label.id, 1);
            expect(values).toHaveLength(2);
        });

        it('should support breakpoints', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.image',
                section: 'home',
                type: 'image',
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: 'sm',
                value: { type: 'image', url: '/sm.jpg' },
            });

            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                breakpoint: 'lg',
                value: { type: 'image', url: '/lg.jpg' },
            });

            const values = await cmsLabelValuesRepository.findByLabelIdAndVersion(label.id, 1);
            expect(values).toHaveLength(2);
        });
    });

    describe('upsertMany', () =>
    {
        it('should create multiple values', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            const results = await cmsLabelValuesRepository.upsertMany([
                {
                    labelId: label.id,
                    version: 1,
                    locale: 'ko',
                    value: { type: 'text', content: '환영합니다' },
                },
                {
                    labelId: label.id,
                    version: 1,
                    locale: 'en',
                    value: { type: 'text', content: 'Welcome' },
                },
                {
                    labelId: label.id,
                    version: 1,
                    locale: 'ja',
                    value: { type: 'text', content: 'ようこそ' },
                },
            ]);

            expect(results).toHaveLength(3);
        });

        it('should update and create mixed', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            // Pre-existing value
            await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: null,
                locale: 'ko',
                value: { type: 'text', content: 'Old' },
            });

            // Update existing and create new
            await cmsLabelValuesRepository.upsertMany([
                {
                    labelId: label.id,
                    version: null,
                    locale: 'ko',
                    value: { type: 'text', content: 'New' },
                },
                {
                    labelId: label.id,
                    version: null,
                    locale: 'en',
                    value: { type: 'text', content: 'English' },
                },
            ]);

            const values = await cmsLabelValuesRepository.findDraftsByLabelId(label.id);
            expect(values).toHaveLength(2);
        });
    });

    describe('findByLabelIdAndVersion', () =>
    {
        it('should find all values for label and version', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            await cmsLabelValuesRepository.upsertMany([
                {
                    labelId: label.id,
                    version: 1,
                    locale: 'ko',
                    value: { type: 'text', content: 'Korean' },
                },
                {
                    labelId: label.id,
                    version: 1,
                    locale: 'en',
                    value: { type: 'text', content: 'English' },
                },
            ]);

            const results = await cmsLabelValuesRepository.findByLabelIdAndVersion(label.id, 1);

            expect(results).toHaveLength(2);
        });

        it('should filter by locale', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            await cmsLabelValuesRepository.upsertMany([
                {
                    labelId: label.id,
                    version: 1,
                    locale: 'ko',
                    value: { type: 'text', content: 'Korean' },
                },
                {
                    labelId: label.id,
                    version: 1,
                    locale: 'en',
                    value: { type: 'text', content: 'English' },
                },
            ]);

            const results = await cmsLabelValuesRepository.findByLabelIdAndVersion(
                label.id,
                1,
                { locale: 'ko' },
            );

            expect(results).toHaveLength(1);
            expect(results[0].locale).toBe('ko');
        });

        it('should filter by breakpoint', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.image',
                section: 'home',
                type: 'image',
            });

            await cmsLabelValuesRepository.upsertMany([
                {
                    labelId: label.id,
                    version: 1,
                    locale: 'ko',
                    breakpoint: 'sm',
                    value: { type: 'image', url: '/sm.jpg' },
                },
                {
                    labelId: label.id,
                    version: 1,
                    locale: 'ko',
                    breakpoint: 'lg',
                    value: { type: 'image', url: '/lg.jpg' },
                },
                {
                    labelId: label.id,
                    version: 1,
                    locale: 'ko',
                    value: { type: 'image', url: '/default.jpg' },
                },
            ]);

            const smResults = await cmsLabelValuesRepository.findByLabelIdAndVersion(
                label.id,
                1,
                { breakpoint: 'sm' },
            );

            expect(smResults).toHaveLength(1);
            expect(smResults[0].breakpoint).toBe('sm');

            const nullResults = await cmsLabelValuesRepository.findByLabelIdAndVersion(
                label.id,
                1,
                { breakpoint: null },
            );

            expect(nullResults).toHaveLength(1);
            expect(nullResults[0].breakpoint).toBeNull();
        });

        it('should return empty array for non-existent version', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            const results = await cmsLabelValuesRepository.findByLabelIdAndVersion(label.id, 999);

            expect(results).toEqual([]);
        });
    });

    describe('deleteByVersion', () =>
    {
        it('should delete all values for a version', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.title',
                section: 'home',
                type: 'text',
            });

            await cmsLabelValuesRepository.upsertMany([
                {
                    labelId: label.id,
                    version: 1,
                    locale: 'ko',
                    value: { type: 'text', content: 'Korean' },
                },
                {
                    labelId: label.id,
                    version: 1,
                    locale: 'en',
                    value: { type: 'text', content: 'English' },
                },
                {
                    labelId: label.id,
                    version: 2,
                    locale: 'ko',
                    value: { type: 'text', content: 'Korean V2' },
                },
            ]);

            await cmsLabelValuesRepository.deleteByVersion(label.id, 1);

            const v1Results = await cmsLabelValuesRepository.findByLabelIdAndVersion(label.id, 1);
            const v2Results = await cmsLabelValuesRepository.findByLabelIdAndVersion(label.id, 2);

            expect(v1Results).toEqual([]);
            expect(v2Results).toHaveLength(1);
        });
    });

    describe('edge cases', () =>
    {
        it('should handle complex value structures', async () =>
        {
            const label = await cmsLabelsRepository.create({
                key: 'home.hero.section',
                section: 'home',
                type: 'object',
            });

            const complexValue = {
                type: 'object',
                fields: {
                    title: { type: 'text', content: 'Hello' },
                    image: {
                        type: 'image',
                        url: '/image.jpg',
                        alt: 'Hero',
                        width: 1920,
                        height: 1080,
                    },
                    cta: {
                        text: 'Get Started',
                        link: '/start',
                    },
                },
            };

            const result = await cmsLabelValuesRepository.upsert({
                labelId: label.id,
                version: 1,
                locale: 'ko',
                value: complexValue,
            });

            expect(result.value).toEqual(complexValue);
        });
    });
});
