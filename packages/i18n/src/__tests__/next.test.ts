import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { createLocaleProxy } from '../next';
import { defineI18nRouting } from '../routing';

const routing = defineI18nRouting({
    locales: ['en', 'ko'],
    defaultLocale: 'en',
    localePrefix: 'as-needed',
    siteUrl: 'https://example.com',
});

const localeProxy = createLocaleProxy(routing, {
    isLocalizedPath: pathname => pathname === '/' || pathname === '/pricing',
});

describe('createLocaleProxy', () =>
{
    it('rewrites unprefixed default-locale paths and preserves the query', () =>
    {
        const response = localeProxy(new NextRequest('https://example.com/pricing?plan=team'));

        expect(response.status).toBe(200);
        expect(response.headers.get('x-middleware-rewrite'))
            .toBe('https://example.com/en/pricing?plan=team');
    });

    it('normalizes an explicit default-locale prefix with a permanent redirect', () =>
    {
        const response = localeProxy(new NextRequest('https://example.com/en?ref=docs'));

        expect(response.status).toBe(308);
        expect(response.headers.get('location')).toBe('https://example.com/?ref=docs');
    });

    it('passes another supported locale through unchanged', () =>
    {
        const response = localeProxy(new NextRequest('https://example.com/ko/pricing'));

        expect(response.headers.get('x-middleware-next')).toBe('1');
        expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    });

    it('passes paths the app did not declare as localized', () =>
    {
        const response = localeProxy(new NextRequest('https://example.com/api/health'));

        expect(response.headers.get('x-middleware-next')).toBe('1');
        expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    });

    it('redirects an unprefixed path when every locale must be prefixed', () =>
    {
        const alwaysPrefixed = defineI18nRouting({
            locales: ['en', 'ko'],
            defaultLocale: 'en',
            localePrefix: 'always',
            siteUrl: 'https://example.com',
        });
        const proxy = createLocaleProxy(alwaysPrefixed, {
            isLocalizedPath: pathname => pathname === '/pricing',
        });
        const response = proxy(new NextRequest('https://example.com/pricing'));

        expect(response.status).toBe(308);
        expect(response.headers.get('location')).toBe('https://example.com/en/pricing');
    });
});
