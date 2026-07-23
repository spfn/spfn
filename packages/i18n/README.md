# @spfn/i18n

`@spfn/i18n` is a small, content-agnostic internationalization runtime for SPFN and React applications. Your application owns its translation catalogs and locale resolution; the package provides interpolation, fallback lookup, server helpers, and a React context.

## Installation

```bash
pnpm add @spfn/i18n
```

Install React only when using the client entry point:

```bash
pnpm add react
```

## Catalogs

Catalogs are plain objects organized as `locale -> namespace -> key -> message`:

```ts
import type { LocaleCatalogs } from '@spfn/i18n';

export const catalogs: LocaleCatalogs = {
    en: {
        common: {
            greeting: 'Hello, {name}',
            save: 'Save',
        },
    },
    ko: {
        common: {
            greeting: '안녕하세요, {name}',
        },
    },
};
```

Messages support named string and number placeholders. A missing variable remains visible as its original placeholder, and an unknown message key is returned unchanged.

## Server usage

Configure the server registry once during application startup:

```ts
import { configureI18n, getT } from '@spfn/i18n/server';
import { catalogs } from './catalogs';

configureI18n({ catalogs, fallbackLocale: 'en' });

const t = getT('common', user.locale);
console.log(t('greeting', { name: user.name }));
```

Locale selection stays with the application. It can come from an authenticated SPFN profile, a route parameter, a request header, or any other application policy.

## React and Next.js usage

Resolve only the namespaces needed by the client subtree and pass them across the server/client boundary:

```tsx
// Server component
import { getClientMessages } from '@spfn/i18n/server';
import { I18nProvider } from '@spfn/i18n/client';

export function LocalizedLayout({
    locale,
    children,
}: {
    locale: string;
    children: React.ReactNode;
})
{
    const messages = getClientMessages(locale, ['common']);

    return (
        <I18nProvider locale={locale} messages={messages}>
            {children}
        </I18nProvider>
    );
}
```

Client components use namespace-scoped translators:

```tsx
'use client';

import { useLocale, useT } from '@spfn/i18n/client';

export function Greeting({ name }: { name: string })
{
    const locale = useLocale();
    const t = useT('common');

    return <p lang={locale}>{t('greeting', { name })}</p>;
}
```

`getClientMessages` merges fallback messages first and locale-specific messages second, so the client receives a complete, serializable dictionary without a loading flash.

## Core API

The package root can also be used independently of React or SPFN:

```ts
import { createTranslator } from '@spfn/i18n';

const t = createTranslator(
    { greeting: 'Bonjour, {name}' },
    { farewell: 'Goodbye' },
);

t('greeting', { name: 'Ada' }); // "Bonjour, Ada"
t('farewell'); // "Goodbye"
t('missing'); // "missing"
```

## Scope

This runtime intentionally does not load catalog files, detect locales, format dates or numbers, or implement plural rules. Use platform `Intl` APIs for locale-aware formatting and keep catalog loading and locale policy in the consuming application.

Interpolation returns strings; it does not sanitize HTML. React escapes text values by default, but applications must sanitize messages before inserting them as raw HTML.

## License

MIT
