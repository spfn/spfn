import { normalizePathname } from './internal/path';

export type LocalePrefix = 'always' | 'as-needed';

export interface I18nRoutingOptions<Locales extends readonly [string, ...string[]]>
{
    locales: Locales;
    defaultLocale: Locales[number];
    localePrefix: LocalePrefix;
    siteUrl: string;
}

export interface LocalizedMetadataOptions<Locale extends string>
{
    locale: Locale;
    pathname?: string;
    availableLocales?: readonly Locale[];
    xDefault?: boolean;
}

export interface LocalizedMetadata
{
    canonical: string;
    languages: Record<string, string>;
}

function joinPath(prefix: string, pathname: string): string
{
    const normalized = normalizePathname(pathname);

    return normalized === '/' ? prefix : `${prefix}${normalized}`;
}

function publicPathFor<Locale extends string>(
    locale: Locale,
    pathname: string,
    defaultLocale: Locale,
    localePrefix: LocalePrefix,
): string
{
    const normalized = normalizePathname(pathname);
    if (localePrefix === 'as-needed' && locale === defaultLocale)
    {
        return normalized;
    }

    return joinPath(`/${locale}`, normalized);
}

/**
 * A site URL may carry a path of its own — an app served under `/docs` names
 * `https://example.com/docs/` as its site. Resolving a rooted pathname against
 * that base would drop the `/docs` segment, so the base path is prepended
 * rather than resolved away.
 */
function absoluteUrl(siteUrl: URL, pathname: string): string
{
    const basePath = siteUrl.pathname.replace(/\/+$/, '');

    return new URL(`${basePath}${normalizePathname(pathname)}`, siteUrl).toString();
}

function metadataFor<Locale extends string>(
    metadata: LocalizedMetadataOptions<Locale>,
    locales: readonly Locale[],
    defaultLocale: Locale,
    absolutePublicUrl: (locale: Locale, pathname?: string) => string,
): LocalizedMetadata
{
    const {
        locale,
        pathname = '/',
        availableLocales = locales,
        xDefault = true,
    } = metadata;

    // A page's alternates have to name the page itself: a set of hreflang links
    // with no reciprocal link back is discarded whole by search engines. A
    // caller describing a page in a locale it left out of `availableLocales` is
    // an ordinary case — content that exists in a subset of locales, rendered
    // with fallbacks — so the missing link is added rather than the page's
    // metadata failing to render.
    const reciprocal = availableLocales.includes(locale)
        ? availableLocales
        : [locale, ...availableLocales];
    const languages = Object.fromEntries(reciprocal.map(availableLocale => [
        availableLocale,
        absolutePublicUrl(availableLocale, pathname),
    ]));

    if (xDefault)
    {
        languages['x-default'] = absolutePublicUrl(defaultLocale, pathname);
    }

    return {
        canonical: absolutePublicUrl(locale, pathname),
        languages,
    };
}

/**
 * Defines an application's locale URL policy without detecting a locale or
 * owning any routes. The returned helpers keep public and internal paths
 * separate so a Next.js app can render from one `[locale]` route tree.
 */
export function defineI18nRouting<const Locales extends readonly [string, ...string[]]>(
    options: I18nRoutingOptions<Locales>,
)
{
    type Locale = Locales[number];

    const localeSet = new Set<string>(options.locales);
    const siteUrl = new URL(options.siteUrl);

    if (!localeSet.has(options.defaultLocale))
    {
        throw new Error(`Default locale "${options.defaultLocale}" is not listed in locales`);
    }

    const hasLocale = (value: string): value is Locale => localeSet.has(value);
    const publicPath = (locale: Locale, pathname = '/'): string =>
        publicPathFor(locale, pathname, options.defaultLocale, options.localePrefix);
    const internalPath = (locale: Locale, pathname = '/'): string =>
        joinPath(`/${locale}`, pathname);
    const absolutePublicUrl = (locale: Locale, pathname = '/'): string =>
        absoluteUrl(siteUrl, publicPath(locale, pathname));
    const localizedMetadata = (metadata: LocalizedMetadataOptions<Locale>): LocalizedMetadata =>
        metadataFor(metadata, options.locales, options.defaultLocale, absolutePublicUrl);

    return {
        ...options,
        hasLocale,
        publicPath,
        internalPath,
        absolutePublicUrl,
        localizedMetadata,
    } as const;
}
