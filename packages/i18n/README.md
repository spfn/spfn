# @spfn/i18n

> **One set of translations, used the same way on the server and in the browser**

Text lives in two places at once — in server responses and emails, and in React components. Keeping one catalog for both, without shipping every language to the browser and without a loading flash on first paint, is the part that is annoying to write twice.

`@spfn/i18n` is a small, content-agnostic internationalization runtime for SPFN and React applications. It supplies interpolation, fallback lookup, server helpers and a React context. Your application keeps what is genuinely yours: the translation catalogs, and how a locale is decided.

It is part of the default `spfn create --mode full` setup, so a scaffolded app already has it wired. If your product will only ever speak one language, nothing forces you to use it.

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

## How do I translate on the server?

Configure the server registry once during application startup:

```ts
import { configureI18n, getT } from '@spfn/i18n/server';
import { catalogs } from './catalogs';

configureI18n({ catalogs, fallbackLocale: 'en' });

const t = getT('common', user.locale);
console.log(t('greeting', { name: user.name }));
```

Locale selection stays with the application. It can come from an authenticated SPFN profile, a route parameter, a request header, or any other application policy.

## How do I use it in a Next.js app?

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

## Can I use it without React or SPFN?

Yes. The package root is a standalone translator:

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

## FAQ

**Where does the locale come from?**
From your application, always. This package never guesses. Common sources are the authenticated SPFN profile (`@spfn/auth` stores a per-user locale and exposes `updateLocale`), a route segment such as `/ko/...`, or an `Accept-Language` header. Pass whichever you use into `getT` and `getClientMessages`.

**Does the browser download every language?**
No, and that is what `getClientMessages(locale, ['common'])` is for: it resolves the one locale and only the namespaces that subtree needs, merges the fallback underneath, and hands the result to `I18nProvider` as a complete dictionary. Nothing loads after paint, so there is no flash of untranslated text.

**What happens to a key I forgot to translate?**
The fallback locale answers first. If it has no entry either, the key itself is returned unchanged, so a missed string shows up as `checkout.submit` rather than as an empty page. A missing interpolation variable stays visible as `{name}` for the same reason.

**Can it format dates, currency or plurals?**
No — use the platform's `Intl` APIs. See Scope below for what else the package deliberately leaves to you.

## Scope

This runtime intentionally does not load catalog files, detect locales, format dates or numbers, or implement plural rules. Use platform `Intl` APIs for locale-aware formatting and keep catalog loading and locale policy in the consuming application.

Interpolation returns strings; it does not sanitize HTML. React escapes text values by default, but applications must sanitize messages before inserting them as raw HTML.

## License

MIT
