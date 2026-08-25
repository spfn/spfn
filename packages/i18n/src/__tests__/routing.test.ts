import { describe, expect, it } from 'vitest';
import { defineI18nRouting } from '../routing';

const routing = defineI18nRouting({
    locales: ['en', 'ko'],
    defaultLocale: 'en',
    localePrefix: 'as-needed',
    siteUrl: 'https://example.com',
});

describe('defineI18nRouting', () =>
{
    it('keeps the default locale unprefixed and prefixes other locales', () =>
    {
        expect(routing.publicPath('en')).toBe('/');
        expect(routing.publicPath('en', '/pricing/')).toBe('/pricing');
        expect(routing.publicPath('ko')).toBe('/ko');
        expect(routing.publicPath('ko', 'pricing')).toBe('/ko/pricing');
        expect(routing.internalPath('en', '/pricing')).toBe('/en/pricing');
    });

    it('builds canonical and reciprocal alternate URLs from public paths', () =>
    {
        expect(routing.localizedMetadata({ locale: 'ko', pathname: '/pricing' })).toEqual({
            canonical: 'https://example.com/ko/pricing',
            languages: {
                en: 'https://example.com/pricing',
                ko: 'https://example.com/ko/pricing',
                'x-default': 'https://example.com/pricing',
            },
        });
    });

    it('can limit alternates and omit x-default', () =>
    {
        expect(routing.localizedMetadata({
            locale: 'en',
            availableLocales: ['en'],
            xDefault: false,
        })).toEqual({
            canonical: 'https://example.com/',
            languages: { en: 'https://example.com/' },
        });
    });

    it('rejects a default locale that is not supported', () =>
    {
        expect(() => defineI18nRouting({
            locales: ['en', 'ko'],
            defaultLocale: 'ja' as 'en',
            localePrefix: 'as-needed',
            siteUrl: 'https://example.com',
        })).toThrow('Default locale "ja" is not listed in locales');
    });
});
