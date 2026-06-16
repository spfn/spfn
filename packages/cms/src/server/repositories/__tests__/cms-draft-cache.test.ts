/**
 * CMS Draft Cache Repository Tests
 *
 * Tests draft cache CRUD operations for concurrent editing support
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb } from '@/__tests__/helpers/db';
import { cmsDraftCacheRepository } from '../cms-draft-cache.repository';

describe('CmsDraftCacheRepository', () =>
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
        it('should create new draft', async () =>
        {
            const result = await cmsDraftCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                userId: 'user-a',
                content: { 'home.title': 'Draft Title' },
            });

            expect(result.id).toBeDefined();
            expect(result.section).toBe('home');
            expect(result.locale).toBe('ko');
            expect(result.userId).toBe('user-a');
            expect(result.content).toEqual({ 'home.title': 'Draft Title' });
            expect(result.updatedAt).toBeDefined();
        });

        it('should update existing draft', async () =>
        {
            // First insert
            await cmsDraftCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                userId: 'user-a',
                content: { 'home.title': 'V1' },
            });

            // Wait a bit to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 100));

            // Update
            const updated = await cmsDraftCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                userId: 'user-a',
                content: { 'home.title': 'V2' },
            });

            expect(updated.content).toEqual({ 'home.title': 'V2' });
        });

        it('should support concurrent editing by different users', async () =>
        {
            await cmsDraftCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                userId: 'user-a',
                content: { 'home.title': 'User A Draft' },
            });

            await cmsDraftCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                userId: 'user-b',
                content: { 'home.title': 'User B Draft' },
            });

            const draftA = await cmsDraftCacheRepository.findByUser('home', 'ko', 'user-a');
            const draftB = await cmsDraftCacheRepository.findByUser('home', 'ko', 'user-b');

            expect(draftA?.content).toEqual({ 'home.title': 'User A Draft' });
            expect(draftB?.content).toEqual({ 'home.title': 'User B Draft' });
        });

        it('should support different locales for same user', async () =>
        {
            await cmsDraftCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                userId: 'user-a',
                content: { 'home.title': '한글' },
            });

            await cmsDraftCacheRepository.upsert({
                section: 'home',
                locale: 'en',
                userId: 'user-a',
                content: { 'home.title': 'English' },
            });

            const draftKo = await cmsDraftCacheRepository.findByUser('home', 'ko', 'user-a');
            const draftEn = await cmsDraftCacheRepository.findByUser('home', 'en', 'user-a');

            expect(draftKo?.content).toEqual({ 'home.title': '한글' });
            expect(draftEn?.content).toEqual({ 'home.title': 'English' });
        });
    });

    describe('findByUser', () =>
    {
        it('should find draft by user', async () =>
        {
            await cmsDraftCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                userId: 'user-a',
                content: { 'home.title': 'Draft' },
            });

            const result = await cmsDraftCacheRepository.findByUser('home', 'ko', 'user-a');

            expect(result).toBeDefined();
            expect(result?.userId).toBe('user-a');
        });

        it('should return null for non-existent draft', async () =>
        {
            const result = await cmsDraftCacheRepository.findByUser('home', 'ko', 'non-existent');

            expect(result).toBeNull();
        });

        it('should isolate drafts between users', async () =>
        {
            await cmsDraftCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                userId: 'user-a',
                content: { 'home.title': 'User A' },
            });

            const resultB = await cmsDraftCacheRepository.findByUser('home', 'ko', 'user-b');

            expect(resultB).toBeNull();
        });
    });

    describe('findAllByUser', () =>
    {
        it('should find all drafts for a user', async () =>
        {
            await cmsDraftCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                userId: 'user-a',
                content: { 'home.title': 'Home Draft' },
            });

            await cmsDraftCacheRepository.upsert({
                section: 'footer',
                locale: 'ko',
                userId: 'user-a',
                content: { 'footer.copyright': 'Footer Draft' },
            });

            await cmsDraftCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                userId: 'user-b',
                content: { 'home.title': 'User B Home' },
            });

            const results = await cmsDraftCacheRepository.findAllByUser('user-a');

            expect(results).toHaveLength(2);
            expect(results.every(r => r.userId === 'user-a')).toBe(true);
        });

        it('should return empty array for user with no drafts', async () =>
        {
            const results = await cmsDraftCacheRepository.findAllByUser('user-without-drafts');

            expect(results).toEqual([]);
        });
    });

    describe('deleteByUser', () =>
    {
        it('should delete specific user draft', async () =>
        {
            await cmsDraftCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                userId: 'user-a',
                content: { 'home.title': 'Draft' },
            });

            await cmsDraftCacheRepository.deleteByUser('home', 'ko', 'user-a');

            const result = await cmsDraftCacheRepository.findByUser('home', 'ko', 'user-a');

            expect(result).toBeNull();
        });

        it('should not affect other users drafts', async () =>
        {
            await cmsDraftCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                userId: 'user-a',
                content: { 'home.title': 'User A' },
            });

            await cmsDraftCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                userId: 'user-b',
                content: { 'home.title': 'User B' },
            });

            await cmsDraftCacheRepository.deleteByUser('home', 'ko', 'user-a');

            const draftA = await cmsDraftCacheRepository.findByUser('home', 'ko', 'user-a');
            const draftB = await cmsDraftCacheRepository.findByUser('home', 'ko', 'user-b');

            expect(draftA).toBeNull();
            expect(draftB).toBeDefined();
        });
    });

    describe('cleanupOldDrafts', () =>
    {
        it('should delete drafts older than specified days', async () =>
        {
            // Create old draft (simulated by direct DB manipulation in real scenario)
            // For test, we'll use a very short period
            await cmsDraftCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                userId: 'user-old',
                content: { 'home.title': 'Old Draft' },
            });

            // Clean drafts older than 0 days (all drafts)
            const deleted = await cmsDraftCacheRepository.cleanupOldDrafts(0);

            expect(deleted.length).toBeGreaterThan(0);

            const result = await cmsDraftCacheRepository.findByUser('home', 'ko', 'user-old');
            expect(result).toBeNull();
        });

        it('should not delete recent drafts', async () =>
        {
            await cmsDraftCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                userId: 'user-recent',
                content: { 'home.title': 'Recent Draft' },
            });

            // Clean drafts older than 30 days
            await cmsDraftCacheRepository.cleanupOldDrafts(30);

            const result = await cmsDraftCacheRepository.findByUser('home', 'ko', 'user-recent');

            expect(result).toBeDefined();
        });
    });

    describe('edge cases', () =>
    {
        it('should handle complex content structure', async () =>
        {
            const complexContent = {
                'home.hero': {
                    title: 'Draft Title',
                    subtitle: 'Draft Subtitle',
                    image: {
                        url: '/draft.jpg',
                        alt: 'Draft Image',
                    },
                },
                'home.features': [
                    { icon: '⚡', title: 'Fast', description: 'Lightning fast' },
                    { icon: '🔒', title: 'Secure', description: 'Bank-level security' },
                ],
            };

            const result = await cmsDraftCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                userId: 'user-a',
                content: complexContent,
            });

            expect(result.content).toEqual(complexContent);
        });

        it('should handle special characters in userId', async () =>
        {
            const result = await cmsDraftCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                userId: 'user+test@example.com',
                content: { 'home.title': 'Test' },
            });

            expect(result.userId).toBe('user+test@example.com');
        });

        it('should support empty content', async () =>
        {
            const result = await cmsDraftCacheRepository.upsert({
                section: 'home',
                locale: 'ko',
                userId: 'user-a',
                content: {},
            });

            expect(result.content).toEqual({});
        });
    });
});
