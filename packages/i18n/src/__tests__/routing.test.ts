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

    it('keeps a site URL that carries a path of its own', () =>
    {
        const underDocs = defineI18nRouting({
            locales: ['en', 'ko'],
            defaultLocale: 'en',
            localePrefix: 'as-needed',
            siteUrl: 'https://example.com/docs/',
        });

        expect(underDocs.absolutePublicUrl('en', '/pricing')).toBe('https://example.com/docs/pricing');
        expect(underDocs.absolutePublicUrl('ko', '/pricing')).toBe('https://example.com/docs/ko/pricing');
        expect(underDocs.absolutePublicUrl('en')).toBe('https://example.com/docs/');
    });

    it('keeps a protocol-relative pathname on the site host', () =>
    {
        expect(routing.absolutePublicUrl('en', '//evil.example/x')).toBe('https://example.com/evil.example/x');
        expect(routing.publicPath('en', '//evil.example/x')).toBe('/evil.example/x');
    });

    it('adds the page to its own alternates when the caller left it out', () =>
    {
        expect(routing.localizedMetadata({
            locale: 'ko',
            pathname: '/pricing',
            availableLocales: ['en'],
        })).toEqual({
            canonical: 'https://example.com/ko/pricing',
            languages: {
                ko: 'https://example.com/ko/pricing',
                en: 'https://example.com/pricing',
                'x-default': 'https://example.com/pricing',
            },
        });
    });

    it('keeps a pathname from naming another host or escaping the site path', () =>
    {
        const underDocs = defineI18nRouting({
            locales: ['en', 'ko'],
            defaultLocale: 'en',
            localePrefix: 'as-needed',
            siteUrl: 'https://example.com/docs/',
        });

        // A URL parser reads a backslash as a separator and strips control
        // characters before parsing, so each of these named another host
        // before the pathname was reduced to plain segments.
        expect(routing.absolutePublicUrl('en', '/\\evil.example/x')).toBe('https://example.com/evil.example/x');
        expect(routing.absolutePublicUrl('en', '\\evil.example/x')).toBe('https://example.com/evil.example/x');
        expect(routing.absolutePublicUrl('en', '/\t/evil.example/x')).toBe('https://example.com/evil.example/x');
        expect(routing.absolutePublicUrl('en', '/\n//evil.example/x')).toBe('https://example.com/evil.example/x');

        // And `..` — encoded or not — resolved away the site's own base path.
        expect(underDocs.absolutePublicUrl('ko', '/../../etc')).toBe('https://example.com/docs/ko/etc');
        expect(underDocs.absolutePublicUrl('ko', '/%2e%2e/%2e%2e/etc')).toBe('https://example.com/docs/ko/etc');
    });

    it('matches a trailing-slash pathname to the same URLs', () =>
    {
        expect(routing.publicPath('ko', '/pricing/')).toBe('/ko/pricing');
        expect(routing.localizedMetadata({ locale: 'ko', pathname: '/pricing/' }))
            .toEqual(routing.localizedMetadata({ locale: 'ko', pathname: '/pricing' }));
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
