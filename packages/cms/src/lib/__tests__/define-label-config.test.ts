/**
 * defineLabelConfig Tests
 *
 * Tests type-safe label configuration definition
 */

import { describe, it, expect } from 'vitest';
import { defineLabelConfig } from '../define-labels';

describe('defineLabelConfig', () =>
{
    describe('basic configuration', () =>
    {
        it('should return config with required fields', () =>
        {
            const config = defineLabelConfig({
                locales: ['en', 'ko'] as const,
                defaultLocale: 'en',
            });

            expect(config.locales).toEqual(['en', 'ko']);
            expect(config.defaultLocale).toBe('en');
        });

        it('should support single locale', () =>
        {
            const config = defineLabelConfig({
                locales: ['en'] as const,
                defaultLocale: 'en',
            });

            expect(config.locales).toEqual(['en']);
            expect(config.defaultLocale).toBe('en');
        });

        it('should support multiple locales', () =>
        {
            const config = defineLabelConfig({
                locales: ['en', 'ko', 'ja', 'zh'] as const,
                defaultLocale: 'en',
            });

            expect(config.locales).toEqual(['en', 'ko', 'ja', 'zh']);
            expect(config.defaultLocale).toBe('en');
        });
    });

    describe('defaultLocale', () =>
    {
        it('should accept any locale from locales array', () =>
        {
            const config1 = defineLabelConfig({
                locales: ['en', 'ko', 'ja'] as const,
                defaultLocale: 'en',
            });

            const config2 = defineLabelConfig({
                locales: ['en', 'ko', 'ja'] as const,
                defaultLocale: 'ko',
            });

            const config3 = defineLabelConfig({
                locales: ['en', 'ko', 'ja'] as const,
                defaultLocale: 'ja',
            });

            expect(config1.defaultLocale).toBe('en');
            expect(config2.defaultLocale).toBe('ko');
            expect(config3.defaultLocale).toBe('ja');
        });
    });

    describe('fallbackLocale', () =>
    {
        it('should support optional fallbackLocale', () =>
        {
            const config = defineLabelConfig({
                locales: ['en', 'ko'] as const,
                defaultLocale: 'ko',
                fallbackLocale: 'en',
            });

            expect(config.fallbackLocale).toBe('en');
        });

        it('should work without fallbackLocale', () =>
        {
            const config = defineLabelConfig({
                locales: ['en', 'ko'] as const,
                defaultLocale: 'en',
            });

            expect(config.fallbackLocale).toBeUndefined();
        });

        it('should accept any locale from locales array as fallback', () =>
        {
            const config = defineLabelConfig({
                locales: ['en', 'ko', 'ja'] as const,
                defaultLocale: 'ko',
                fallbackLocale: 'ja',
            });

            expect(config.fallbackLocale).toBe('ja');
        });
    });

    describe('type safety', () =>
    {
        it('should preserve const assertion types', () =>
        {
            const config = defineLabelConfig({
                locales: ['en', 'ar'] as const,
                defaultLocale: 'en',
            });

            // Type test: This should work at compile time
            type AppLocale = typeof config.locales[number];
            const locale: AppLocale = 'en';

            expect(locale).toBe('en');
        });

        it('should allow extracting config type', () =>
        {
            const config = defineLabelConfig({
                locales: ['en', 'ko'] as const,
                defaultLocale: 'en',
            });

            type LabelConfig = typeof config;
            const testConfig: LabelConfig = {
                locales: ['en', 'ko'],
                defaultLocale: 'en',
            };

            expect(testConfig).toEqual({
                locales: ['en', 'ko'],
                defaultLocale: 'en',
            });
        });
    });

    describe('real-world scenarios', () =>
    {
        it('should handle typical bilingual setup', () =>
        {
            const config = defineLabelConfig({
                locales: ['en', 'ar'] as const,
                defaultLocale: 'en',
                fallbackLocale: 'en',
            });

            expect(config).toEqual({
                locales: ['en', 'ar'],
                defaultLocale: 'en',
                fallbackLocale: 'en',
            });
        });

        it('should handle multilingual setup', () =>
        {
            const config = defineLabelConfig({
                locales: ['en', 'ko', 'ja', 'zh', 'es', 'fr'] as const,
                defaultLocale: 'en',
                fallbackLocale: 'en',
            });

            expect(config.locales).toHaveLength(6);
            expect(config.defaultLocale).toBe('en');
            expect(config.fallbackLocale).toBe('en');
        });

        it('should handle Korean as default locale', () =>
        {
            const config = defineLabelConfig({
                locales: ['ko', 'en'] as const,
                defaultLocale: 'ko',
                fallbackLocale: 'en',
            });

            expect(config.defaultLocale).toBe('ko');
            expect(config.fallbackLocale).toBe('en');
        });
    });

    describe('edge cases', () =>
    {
        it('should handle locales with hyphens', () =>
        {
            const config = defineLabelConfig({
                locales: ['en-US', 'en-GB', 'zh-CN'] as const,
                defaultLocale: 'en-US',
            });

            expect(config.locales).toEqual(['en-US', 'en-GB', 'zh-CN']);
            expect(config.defaultLocale).toBe('en-US');
        });

        it('should handle same defaultLocale and fallbackLocale', () =>
        {
            const config = defineLabelConfig({
                locales: ['en', 'ko'] as const,
                defaultLocale: 'en',
                fallbackLocale: 'en',
            });

            expect(config.defaultLocale).toBe('en');
            expect(config.fallbackLocale).toBe('en');
        });
    });
});