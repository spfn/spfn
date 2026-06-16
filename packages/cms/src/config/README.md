# @spfn/cms/config

Type-safe access to `@spfn/cms` environment variables. The `/config` entry point exports
exactly two things:

| Export | What it is |
| --- | --- |
| `env` | A validated proxy over `process.env` — read CMS env vars type-safely (validated/coerced on access). |
| `cmsEnvSchema` | The schema (descriptions, defaults, validators) the proxy is built from. |

```typescript
import { env, cmsEnvSchema } from '@spfn/cms/config';

const detectBrowserLanguage = env.SPFN_CMS_DETECT_BROWSER_LANGUAGE; // boolean
console.log(cmsEnvSchema.SPFN_CMS_DETECT_BROWSER_LANGUAGE.description);
```

## Environment variables

| Var | Type | Default | Notes |
| --- | --- | --- | --- |
| `SPFN_CMS_DETECT_BROWSER_LANGUAGE` | boolean | `true` | Detect locale from the browser `Accept-Language` header |
| `SPFN_CMS_DEFAULT_LOCALE` | string | `en` | **Deprecated** — prefer `defaultLocale` in `defineLabelConfig(...)` |

That is the entire CMS env surface. Locale/label behaviour (supported locales, default and
fallback locale) is configured **in code** via `defineLabelConfig({ locales, defaultLocale,
fallbackLocale })`, not through env vars — see the [package README](../../README.md).
