/**
 * @spfn/cms/config tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    env,
    getEnvConfig,
    resetEnvConfig,
    validateEnvConfig,
    getCategories,
    getSchemaByCategory,
    getCmsConfig,
    configureCms,
    resetCmsConfig,
} from '../index';

describe('config', () =>
{
    const originalEnv = { ...process.env };

    beforeEach(() =>
    {
        // Reset environment
        process.env = { ...originalEnv };
        resetEnvConfig();
    });

    afterEach(() =>
    {
        // Restore original environment
        process.env = originalEnv;
        resetEnvConfig();
    });

    describe('getEnvConfig', () =>
    {
        it('should return config with default values', () =>
        {
            const config = getEnvConfig();

            expect(config).toBeDefined();
            expect(config.SPFN_CMS_DEFAULT_LOCALE).toBe('en');
            expect(config.SPFN_CMS_LOCALES).toBe('en,ko');
            expect(config.SPFN_CMS_DETECT_BROWSER_LANGUAGE).toBe(true);
            expect(config.SPFN_CMS_LABELS_DIR).toBe('src/lib/labels');
        });

        it('should use environment variable values when set', () =>
        {
            process.env.SPFN_CMS_DEFAULT_LOCALE = 'ko';
            process.env.SPFN_CMS_LOCALES = 'ko,en,ja';
            process.env.SPFN_CMS_DETECT_BROWSER_LANGUAGE = 'false';
            process.env.SPFN_CMS_LABELS_DIR = 'custom/labels';

            const config = getEnvConfig();

            expect(config.SPFN_CMS_DEFAULT_LOCALE).toBe('ko');
            expect(config.SPFN_CMS_LOCALES).toBe('ko,en,ja');
            expect(config.SPFN_CMS_DETECT_BROWSER_LANGUAGE).toBe(false);
            expect(config.SPFN_CMS_LABELS_DIR).toBe('custom/labels');
        });

        it('should handle deprecated SPFN_CMS_SUPPORTED_LOCALES', () =>
        {
            delete process.env.SPFN_CMS_LOCALES;
            process.env.SPFN_CMS_SUPPORTED_LOCALES = 'en,ko,ja,zh';

            const config = getEnvConfig();

            expect(config.SPFN_CMS_SUPPORTED_LOCALES).toBe('en,ko,ja,zh');
        });
    });

    describe('env proxy', () =>
    {
        it('should provide access to environment variables', () =>
        {
            expect(env.SPFN_CMS_DEFAULT_LOCALE).toBeTypeOf('string');
            expect(env.SPFN_CMS_LOCALES).toBeTypeOf('string');
            expect(env.SPFN_CMS_DETECT_BROWSER_LANGUAGE).toBeTypeOf('boolean');
        });

        it('should be lazy-loaded', () =>
        {
            process.env.SPFN_CMS_DEFAULT_LOCALE = 'ja';

            const value = env.SPFN_CMS_DEFAULT_LOCALE;

            expect(value).toBe('ja');
        });

        it('should cache values after first access', () =>
        {
            const firstAccess = env.SPFN_CMS_DEFAULT_LOCALE;
            process.env.SPFN_CMS_DEFAULT_LOCALE = 'fr';
            const secondAccess = env.SPFN_CMS_DEFAULT_LOCALE;

            // Should be cached, not re-read from environment
            expect(firstAccess).toBe(secondAccess);
        });
    });

    describe('resetEnvConfig', () =>
    {
        it('should clear the env cache', () =>
        {
            const firstAccess = env.SPFN_CMS_DEFAULT_LOCALE;

            process.env.SPFN_CMS_DEFAULT_LOCALE = 'ja';
            resetEnvConfig();

            const secondAccess = env.SPFN_CMS_DEFAULT_LOCALE;

            expect(secondAccess).toBe('ja');
            expect(secondAccess).not.toBe(firstAccess);
        });

        it('should clear the CMS config cache', () =>
        {
            const firstConfig = getCmsConfig();

            configureCms({ defaultLocale: 'ja' });
            const modifiedConfig = getCmsConfig();

            expect(modifiedConfig.defaultLocale).toBe('ja');

            resetEnvConfig();
            const resetConfig = getCmsConfig();

            // Should be reset to env value
            expect(resetConfig.defaultLocale).toBe(firstConfig.defaultLocale);
        });
    });

    describe('validateEnvConfig', () =>
    {
        it('should not throw for valid configuration', () =>
        {
            expect(() => validateEnvConfig()).not.toThrow();
        });

        it('should not throw when optional variables are missing', () =>
        {
            delete process.env.SPFN_CMS_SUPPORTED_LOCALES;

            expect(() => validateEnvConfig()).not.toThrow();
        });
    });

    describe('getCategories', () =>
    {
        it('should return all unique categories', () =>
        {
            const categories = getCategories();

            expect(categories).toContain('cms');
            expect(categories.length).toBeGreaterThan(0);
        });

        it('should return sorted categories', () =>
        {
            const categories = getCategories();
            const sorted = [...categories].sort();

            expect(categories).toEqual(sorted);
        });
    });

    describe('getSchemaByCategory', () =>
    {
        it('should return schema entries for cms category', () =>
        {
            const cmsVars = getSchemaByCategory('cms');

            expect(cmsVars.length).toBeGreaterThan(0);
            expect(cmsVars.every(v => v.category === 'cms')).toBe(true);
            expect(cmsVars.some(v => v.key === 'SPFN_CMS_DEFAULT_LOCALE')).toBe(true);
            expect(cmsVars.some(v => v.key === 'SPFN_CMS_LOCALES')).toBe(true);
        });

        it('should return empty array for non-existent category', () =>
        {
            const vars = getSchemaByCategory('non-existent');

            expect(vars).toEqual([]);
        });
    });

    describe('getCmsConfig', () =>
    {
        it('should return CMS configuration with parsed values', () =>
        {
            const config = getCmsConfig();

            expect(config).toBeDefined();
            expect(config.defaultLocale).toBeTypeOf('string');
            expect(Array.isArray(config.locales)).toBe(true);
            expect(config.detectBrowserLanguage).toBeTypeOf('boolean');
        });

        it('should parse locales from comma-separated string', () =>
        {
            process.env.SPFN_CMS_LOCALES = 'en,ko,ja';
            resetEnvConfig();

            const config = getCmsConfig();

            expect(config.locales).toEqual(['en', 'ko', 'ja']);
        });

        it('should add default locale to locales if not present', () =>
        {
            process.env.SPFN_CMS_DEFAULT_LOCALE = 'fr';
            process.env.SPFN_CMS_LOCALES = 'en,ko';
            resetEnvConfig();

            const config = getCmsConfig();

            expect(config.locales).toContain('fr');
            expect(config.locales[0]).toBe('fr');
        });

        it('should handle backward compatibility with SPFN_CMS_SUPPORTED_LOCALES', () =>
        {
            delete process.env.SPFN_CMS_LOCALES;
            process.env.SPFN_CMS_SUPPORTED_LOCALES = 'en,ko,ja,zh';
            resetEnvConfig();

            const config = getCmsConfig();

            expect(config.locales).toEqual(['en', 'ko', 'ja', 'zh']);
        });

        it('should trim whitespace from locale strings', () =>
        {
            process.env.SPFN_CMS_LOCALES = ' en , ko , ja ';
            resetEnvConfig();

            const config = getCmsConfig();

            expect(config.locales).toEqual(['en', 'ko', 'ja']);
        });
    });

    describe('configureCms', () =>
    {
        it('should override CMS configuration', () =>
        {
            configureCms({
                defaultLocale: 'ja',
                locales: ['ja', 'en', 'ko'],
                detectBrowserLanguage: false,
            });

            const config = getCmsConfig();

            expect(config.defaultLocale).toBe('ja');
            expect(config.locales).toEqual(['ja', 'en', 'ko']);
            expect(config.detectBrowserLanguage).toBe(false);
        });

        it('should support partial updates', () =>
        {
            const original = getCmsConfig();

            configureCms({
                defaultLocale: 'ja',
            });

            const updated = getCmsConfig();

            expect(updated.defaultLocale).toBe('ja');
            expect(updated.locales).toEqual(original.locales);
            expect(updated.detectBrowserLanguage).toBe(original.detectBrowserLanguage);
        });

        it('should auto-add default locale to locales if missing', () =>
        {
            configureCms({
                defaultLocale: 'zh',
                locales: ['en', 'ko'],
            });

            const config = getCmsConfig();

            expect(config.locales).toContain('zh');
            expect(config.locales[0]).toBe('zh');
        });
    });

    describe('resetCmsConfig', () =>
    {
        it('should reset CMS config to environment values', () =>
        {
            process.env.SPFN_CMS_DEFAULT_LOCALE = 'en';
            resetEnvConfig();

            const original = getCmsConfig();
            expect(original.defaultLocale).toBe('en');

            configureCms({ defaultLocale: 'ja' });
            const modified = getCmsConfig();
            expect(modified.defaultLocale).toBe('ja');

            resetCmsConfig();
            const reset = getCmsConfig();
            expect(reset.defaultLocale).toBe('en');
        });
    });

    describe('type conversions', () =>
    {
        it('should convert string boolean to boolean', () =>
        {
            process.env.SPFN_CMS_DETECT_BROWSER_LANGUAGE = 'false';

            const config = getEnvConfig();

            expect(config.SPFN_CMS_DETECT_BROWSER_LANGUAGE).toBe(false);
            expect(typeof config.SPFN_CMS_DETECT_BROWSER_LANGUAGE).toBe('boolean');
        });

        it('should handle various boolean string formats', () =>
        {
            // Test "true"
            process.env.SPFN_CMS_DETECT_BROWSER_LANGUAGE = 'true';
            resetEnvConfig();
            expect(env.SPFN_CMS_DETECT_BROWSER_LANGUAGE).toBe(true);

            // Test "false"
            process.env.SPFN_CMS_DETECT_BROWSER_LANGUAGE = 'false';
            resetEnvConfig();
            expect(env.SPFN_CMS_DETECT_BROWSER_LANGUAGE).toBe(false);

            // Test "1"
            process.env.SPFN_CMS_DETECT_BROWSER_LANGUAGE = '1';
            resetEnvConfig();
            expect(env.SPFN_CMS_DETECT_BROWSER_LANGUAGE).toBe(true);

            // Test "0"
            process.env.SPFN_CMS_DETECT_BROWSER_LANGUAGE = '0';
            resetEnvConfig();
            expect(env.SPFN_CMS_DETECT_BROWSER_LANGUAGE).toBe(false);
        });
    });
});