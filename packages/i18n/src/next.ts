import { NextResponse, type NextRequest } from 'next/server';
import { normalizePathname } from './internal/path';
import type { LocalePrefix } from './routing';

export interface LocaleRoutingAdapter<Locale extends string>
{
    defaultLocale: Locale;
    localePrefix: LocalePrefix;
    hasLocale(value: string): value is Locale;
    publicPath(locale: Locale, pathname?: string): string;
    internalPath(locale: Locale, pathname?: string): string;
}

export interface LocaleProxyOptions
{
    /** The app-owned set of public pathnames that have localized route trees. */
    isLocalizedPath(pathname: string): boolean;
}

/**
 * Splits a request pathname into its first segment and the rest, both
 * normalized. The proxy matches on the same shape the routing policy builds,
 * so a request for `/pricing/` reaches the same declaration as `/pricing`.
 */
function pathWithoutLocale(pathname: string): { locale: string; pathname: string }
{
    const [, locale = '', ...rest] = normalizePathname(pathname).split('/');

    return {
        locale,
        pathname: rest.length === 0 ? '/' : normalizePathname(`/${rest.join('/')}`),
    };
}

/**
 * Routes app-declared localized paths through one internal `[locale]` tree.
 * The consuming app still owns `proxy.ts`, its static matcher, and the route
 * list; undeclared API and machine paths pass through unchanged.
 */
export function createLocaleProxy<Locale extends string>(
    routing: LocaleRoutingAdapter<Locale>,
    options: LocaleProxyOptions,
): (request: NextRequest) => NextResponse
{
    return function localeProxy(request: NextRequest): NextResponse
    {
        const url = request.nextUrl.clone();
        const pathname = normalizePathname(url.pathname);
        const localized = pathWithoutLocale(url.pathname);

        if (routing.hasLocale(localized.locale) && options.isLocalizedPath(localized.pathname))
        {
            if (routing.localePrefix === 'as-needed' && localized.locale === routing.defaultLocale)
            {
                url.pathname = routing.publicPath(localized.locale, localized.pathname);

                return NextResponse.redirect(url, 308);
            }

            return NextResponse.next();
        }

        if (options.isLocalizedPath(pathname))
        {
            if (routing.localePrefix === 'always')
            {
                url.pathname = routing.publicPath(routing.defaultLocale, pathname);

                return NextResponse.redirect(url, 308);
            }

            url.pathname = routing.internalPath(routing.defaultLocale, pathname);

            return NextResponse.rewrite(url);
        }

        return NextResponse.next();
    };
}
