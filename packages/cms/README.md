# @spfn/cms

Content Management System for Next.js with JSON-based labels and automatic database synchronization.

## Features

- 📁 JSON file-based labels
- 🔄 Auto-sync to database
- 🌐 50+ languages support
- 🍪 Cookie-based locale management
- 🔥 Hot reload during development
- 💾 Published cache (17x faster)
- 📝 Draft system & version control

## Installation

```bash
pnpm spfn add @spfn/cms
```

## Quick Start

### 1. Create Label Files

```json
// src/lib/labels/home/hero.json
{
  "title": {
    "key": "home.hero.title",
    "defaultValue": {
      "ko": "혁신적인 솔루션",
      "en": "Innovative Solutions"
    }
  }
}
```

### 2. Enable Auto-Sync

```typescript
// src/server/server.config.ts
import { initLabelSync } from '@spfn/cms/server';

export default {
  beforeRoutes: async (app) => {
    await initLabelSync({ verbose: true });
  },
} satisfies ServerConfig;
```

### 3. Use in Your App

**Server Component:**

```typescript
import { getSection } from '@spfn/cms/server';

export default async function HomePage() {
  const { t } = await getSection('home');
  return <h1>{t('hero.title')}</h1>;
}
```

**Client Component:**

```typescript
'use client';
import { useSection } from '@spfn/cms/client';

export default function Nav() {
  const { t } = useSection('layout', { autoLoad: true });
  return <nav><a>{t('nav.about')}</a></nav>;
}
```

## Documentation

📖 **[Full Documentation](../../docs/ecosystem/cms/index.md)**

- [Getting Started](../../docs/ecosystem/cms/getting-started.md) - Setup and configuration
- [Label Sync Guide](../../docs/ecosystem/cms/label-sync.md) - Auto-sync options
- [Advanced Features](../../docs/ecosystem/cms/advanced-features.md) - Breakpoints, value types, Draft Mode
- [Locale Management](../../docs/ecosystem/cms/locale-management.md) - 50+ languages guide
- [API Reference](../../docs/ecosystem/cms/api-reference.md) - Complete API docs
- [Draft & Versioning](../../docs/ecosystem/cms/draft-versioning.md) - Version control & audit logs

## Configuration

```bash
# .env.local
SPFN_CMS_DEFAULT_LOCALE=ko
SPFN_CMS_SUPPORTED_LOCALES=en,ko,ja
SPFN_CMS_DETECT_BROWSER_LANGUAGE=true
```

## Development Status

This package is currently in alpha. APIs may change.

## License

MIT