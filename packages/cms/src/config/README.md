# @spfn/cms/config

Type-safe access to `@spfn/cms` environment variables. The `/config` entry point exports
exactly one thing:

| Export | What it is |
| --- | --- |
| `env` | A validated proxy over `process.env` — read CMS env vars type-safely (validated/coerced on access). |

```typescript
import { env } from '@spfn/cms/config';

const detectBrowserLanguage = env.SPFN_CMS_DETECT_BROWSER_LANGUAGE; // boolean
```

The schema the proxy is built from (`cmsEnvSchema`, in `schema.ts`) is internal — it is not
re-exported from this entry point, and `@spfn/cms` has no subpath that exposes it.

## Environment variables

| Var | Type | Default | Notes |
| --- | --- | --- | --- |
| `SPFN_CMS_DETECT_BROWSER_LANGUAGE` | boolean | `true` | Declared for content localization; no code in the package reads it yet |
| `SPFN_CMS_DEFAULT_LOCALE` | string | `en` | **Deprecated** — prefer `defaultLocale` in `defineLabelConfig(...)` |

Neither variable currently drives runtime behaviour: `getLocale()` in `actions.ts` resolves
the locale from the `cms-locale` cookie, then the `defaultLocale` passed in code, then `en`.

That is the entire CMS env surface. Locale/label behaviour (supported locales, default and
fallback locale) is configured **in code** via `defineLabelConfig({ locales, defaultLocale,
fallbackLocale })`, not through env vars — see the [package README](../../README.md).
