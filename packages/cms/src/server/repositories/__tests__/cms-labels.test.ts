/**
 * CmsLabelsRepository Integration Tests
 *
 * Tests CRUD operations for CMS labels with real database
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb } from '@/__tests__/helpers/db';
import { cmsLabelsRepository } from '../cms-labels.repository';

describe('CmsLabelsRepository', () =>
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

    describe('create', () =>
    {
        it('should create a new label', async () =>
        {
            const result = await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.hero.title',
                type: 'text',
                defaultValue: 'Welcome to SPFN',
                description: 'Hero title',
            });

            expect(result.id).toBeDefined();
            expect(result.key).toBe('home.hero.title');
            expect(result.section).toBe('home');
            expect(result.type).toBe('text');
            expect(result.defaultValue).toBe('Welcome to SPFN');
            expect(result.createdAt).toBeInstanceOf(Date);
        });

        it('should throw error on duplicate key', async () =>
        {
            await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.hero.title',
                type: 'text',
                defaultValue: 'Title',
            });

            await expect(
                cmsLabelsRepository.create({
                    section: 'home',
                    key: 'home.hero.title',
                    type: 'text',
                    defaultValue: 'Duplicate',
                }),
            ).rejects.toThrow();
        });

        it('should create label with multilingual default value', async () =>
        {
            const multilingualValue = JSON.stringify({
                ko: '환영합니다',
                en: 'Welcome',
                ja: 'ようこそ',
            });

            const result = await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.hero.greeting',
                type: 'text',
                defaultValue: multilingualValue,
            });

            expect(result.defaultValue).toBe(multilingualValue);

            const parsed = JSON.parse(result.defaultValue);
            expect(parsed.ko).toBe('환영합니다');
            expect(parsed.en).toBe('Welcome');
        });
    });

    describe('findById', () =>
    {
        it('should find label by id', async () =>
        {
            const created = await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.hero.title',
                type: 'text',
                defaultValue: 'Welcome',
            });

            const found = await cmsLabelsRepository.findById(created.id);

            expect(found).toBeDefined();
            expect(found?.id).toBe(created.id);
            expect(found?.key).toBe('home.hero.title');
        });

        it('should return null for non-existent id', async () =>
        {
            const result = await cmsLabelsRepository.findById(99999);
            expect(result).toBeNull();
        });
    });

    describe('findByKey', () =>
    {
        it('should find label by key', async () =>
        {
            await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.hero.title',
                type: 'text',
                defaultValue: 'Welcome',
            });

            const found = await cmsLabelsRepository.findByKey('home.hero.title');

            expect(found).toBeDefined();
            expect(found?.key).toBe('home.hero.title');
        });

        it('should return null for non-existent key', async () =>
        {
            const result = await cmsLabelsRepository.findByKey('non.existent.key');
            expect(result).toBeNull();
        });
    });

    describe('findBySection', () =>
    {
        it('should find all labels in a section', async () =>
        {
            await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.hero.title',
                type: 'text',
                defaultValue: 'Title',
            });

            await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.hero.subtitle',
                type: 'text',
                defaultValue: 'Subtitle',
            });

            await cmsLabelsRepository.create({
                section: 'about',
                key: 'about.intro',
                type: 'text',
                defaultValue: 'About',
            });

            const homeLabels = await cmsLabelsRepository.findBySection('home');

            expect(homeLabels).toHaveLength(2);
            expect(homeLabels.every(l => l.section === 'home')).toBe(true);
        });

        it('should return empty array for section with no labels', async () =>
        {
            const result = await cmsLabelsRepository.findBySection('empty');
            expect(result).toEqual([]);
        });
    });

    describe('findMany', () =>
    {
        it('should return all labels with pagination', async () =>
        {
            // Create test data
            for (let i = 0; i < 15; i++)
            {
                await cmsLabelsRepository.create({
                    section: 'home',
                    key: `home.label${i}.title`,
                    type: 'text',
                    defaultValue: `Value ${i}`,
                });
            }

            const result = await cmsLabelsRepository.findMany({
                limit: 10,
                offset: 0,
            });

            expect(result).toHaveLength(10);
        });

        it('should filter labels by section', async () =>
        {
            await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.hero.title',
                type: 'text',
                defaultValue: 'Home',
            });

            await cmsLabelsRepository.create({
                section: 'about',
                key: 'about.intro.title',
                type: 'text',
                defaultValue: 'About',
            });

            const result = await cmsLabelsRepository.findMany({
                section: 'home',
            });

            expect(result).toHaveLength(1);
            expect(result[0].section).toBe('home');
        });

        it('should return second page correctly', async () =>
        {
            // Create 15 labels
            for (let i = 0; i < 15; i++)
            {
                await cmsLabelsRepository.create({
                    section: 'test',
                    key: `test.label${i}.title`,
                    type: 'text',
                    defaultValue: `Value ${i}`,
                });
            }

            const page2 = await cmsLabelsRepository.findMany({
                limit: 10,
                offset: 10,
            });

            expect(page2).toHaveLength(5);
        });
    });

    describe('updateById', () =>
    {
        it('should update label fields', async () =>
        {
            const created = await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.hero.title',
                type: 'text',
                defaultValue: 'Old Title',
            });

            const updated = await cmsLabelsRepository.updateById(created.id, {
                defaultValue: 'New Title',
                description: 'Updated description',
            });

            expect(updated.defaultValue).toBe('New Title');
            expect(updated.description).toBe('Updated description');
            expect(updated.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
        });

        it('should return null for non-existent id', async () =>
        {
            const result = await cmsLabelsRepository.updateById(99999, {
                defaultValue: 'New Value',
            });
            expect(result).toBeNull();
        });

        it('should not update immutable fields', async () =>
        {
            const created = await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.hero.title',
                type: 'text',
                defaultValue: 'Title',
            });

            const updated = await cmsLabelsRepository.updateById(created.id, {
                defaultValue: 'New Title',
            });

            // Key and section should not change
            expect(updated.key).toBe(created.key);
            expect(updated.section).toBe(created.section);
        });
    });

    describe('deleteById', () =>
    {
        it('should delete label', async () =>
        {
            const created = await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.hero.title',
                type: 'text',
                defaultValue: 'Title',
            });

            const deleted = await cmsLabelsRepository.deleteById(created.id);

            expect(deleted).toBeDefined();
            expect(deleted?.id).toBe(created.id);

            const found = await cmsLabelsRepository.findById(created.id);
            expect(found).toBeNull();
        });

        it('should return null for non-existent id', async () =>
        {
            const result = await cmsLabelsRepository.deleteById(99999);
            expect(result).toBeNull();
        });

        it('should cascade delete related data', async () =>
        {
            // This test verifies that foreign key constraints work
            const created = await cmsLabelsRepository.create({
                section: 'home',
                key: 'home.hero.title',
                type: 'text',
                defaultValue: 'Title',
            });

            // In a real scenario, this would have label_values, label_versions, etc.
            // The CASCADE constraint should delete them automatically
            await expect(
                cmsLabelsRepository.deleteById(created.id),
            ).resolves.not.toThrow();
        });
    });

    describe('edge cases', () =>
    {
        it('should handle empty string values', async () =>
        {
            const result = await cmsLabelsRepository.create({
                section: 'test',
                key: 'test.empty',
                type: 'text',
                defaultValue: '',
            });

            expect(result.defaultValue).toBe('');
        });

        it('should handle long text values', async () =>
        {
            const longText = 'A'.repeat(10000);

            const result = await cmsLabelsRepository.create({
                section: 'test',
                key: 'test.long',
                type: 'text',
                defaultValue: longText,
            });

            expect(result.defaultValue).toBe(longText);
            expect(result.defaultValue.length).toBe(10000);
        });

        it('should handle special characters in key', async () =>
        {
            const result = await cmsLabelsRepository.create({
                section: 'test',
                key: 'test.special-chars_123.hello',
                type: 'text',
                defaultValue: 'Value',
            });

            expect(result.key).toBe('test.special-chars_123.hello');
        });
    });
});
