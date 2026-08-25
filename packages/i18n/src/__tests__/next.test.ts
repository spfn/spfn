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

    // Next keeps whatever trailing-slash convention the request arrived with,
    // so the assertion is that the path was recognized and rewritten at all —
    // before, an app declaring `/pricing` let `/pricing/` past untouched.
    it('rewrites a trailing-slash request the app declared without one', () =>
    {
        const response = localeProxy(new NextRequest('https://example.com/pricing/?plan=team'));

        expect(response.headers.get('x-middleware-rewrite'))
            .toBe('https://example.com/en/pricing/?plan=team');
    });

    it('normalizes a trailing-slash default-locale prefix instead of passing it through', () =>
    {
        const response = localeProxy(new NextRequest('https://example.com/en/pricing/'));

        expect(response.status).toBe(308);
        expect(response.headers.get('location')).toBe('https://example.com/pricing/');
    });

    it('does not treat a doubled leading slash as an undeclared path', () =>
    {
        const response = localeProxy(new NextRequest('https://example.com//pricing'));

        expect(response.headers.get('x-middleware-rewrite'))
            .toBe('https://example.com/en/pricing');
    });

    // The contract the app writes against: `isLocalizedPath` is asked about a
    // normalized pathname, so an app declares `/pricing`, never `/pricing/`.
    it('asks the app about normalized pathnames only', () =>
    {
        const asked: string[] = [];
        const recording = createLocaleProxy(routing, {
            isLocalizedPath: (pathname) =>
            {
                asked.push(pathname);

                return false;
            },
        });

        recording(new NextRequest('https://example.com/pricing/'));
        recording(new NextRequest('https://example.com/ko/pricing/'));
        recording(new NextRequest('https://example.com//pricing'));

        expect(asked).toEqual(['/pricing', '/pricing', '/ko/pricing', '/pricing']);
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
