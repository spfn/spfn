# @spfn/cms

Content Management System for Next.js with JSON-based labels and automatic database synchronization.

## Features

- 📁 **JSON file-based labels** - Simple file structure for label management
- 🔄 **Auto-sync to database** on server startup and during development
- 🌐 **Multi-language support** (i18n)
- 🍪 **Cookie-based locale management** - Automatic locale detection and persistence
- 📦 **Folder-based structure** for better organization
- 🔥 **Hot reload** during development
- 💾 **Published cache** for optimal performance
- ⚡ **Server Actions** for client-side locale management
- 🛠️ **Built on Drizzle ORM**

## Installation

### Recommended: Using SPFN CLI (Automatic Database Setup)

```bash
pnpm spfn add @spfn/cms
```

This command will:
1. ✅ Install the package
2. ✅ Discover CMS database schemas automatically
3. ✅ Generate migrations for 6 CMS tables
4. ✅ Apply migrations to your database
5. ✅ Show setup guide

**Tables created:**
- `cms_labels` - Label definitions (10 columns, 2 indexes)
- `cms_label_values` - Label values per locale (7 columns, 2 indexes, 1 FK)
- `cms_label_versions` - Version history (9 columns, 2 indexes, 1 FK)
- `cms_draft_cache` - Draft content cache (6 columns, 2 indexes)
- `cms_published_cache` - Published content cache (7 columns, 1 index)
- `cms_audit_logs` - Change audit trail (8 columns, 4 indexes, 1 FK)

### Manual Installation

```bash
pnpm add @spfn/cms
```

Then run database migrations:

```bash
pnpm spfn db generate  # Generate migrations
pnpm spfn db migrate   # Apply migrations
```

**Note:** Manual installation requires that you have `DATABASE_URL` configured in your `.env.local` file.

## Quick Start

### 1. Create Label Files

Create JSON files organized by sections and categories:

```
src/cms/labels/
  layout/              ← Section name
    nav.json           ← Category
    footer.json
  home/
    hero.json
    features.json
```

**Example:** `src/cms/labels/layout/nav.json`

```json
{
  "about": {
    "key": "layout.nav.about",
    "defaultValue": "About",
    "description": "Navigation link for About page"
  },
  "services": {
    "key": "layout.nav.services",
    "defaultValue": "Services",
    "description": "Navigation link for Services page"
  },
  "team": {
    "key": "layout.nav.team",
    "defaultValue": "Team"
  }
}
```

**Multi-language example:** `src/cms/labels/home/hero.json`

```json
{
  "title": {
    "key": "home.hero.title",
    "defaultValue": {
      "ko": "혁신적인 솔루션",
      "en": "Innovative Solutions"
    }
  },
  "subtitle": {
    "key": "home.hero.subtitle",
    "defaultValue": {
      "ko": "비즈니스 성장을 위한 최고의 파트너",
      "en": "Your Best Partner for Business Growth"
    }
  }
}
```

**Variable substitution:** `src/cms/labels/layout/footer.json`

```json
{
  "copyright": {
    "key": "layout.footer.copyright",
    "defaultValue": "© {year} Company. All rights reserved."
  }
}
```

### 2. Enable Auto-Sync on Server Startup

Configure `src/server/server.config.ts`:

```typescript
import type { ServerConfig } from '@spfn/core/server';
import { initLabelSync } from '@spfn/cms';

export default {
  beforeRoutes: async (app) => {
    await initLabelSync({
      verbose: true,
      labelsDir: 'src/cms/labels'  // Optional, this is the default
    });
  },
} satisfies ServerConfig;
```

### 3. Enable Auto-Sync During Development

Your `.spfnrc.json` should include:

```json
{
  "codegen": {
    "generators": [
      {
        "name": "@spfn/cms:label-sync",
        "enabled": true
      }
    ]
  }
}
```

This is automatically configured when you run `pnpm spfn add @spfn/cms`.

### 4. Use Labels in Your App

**Server Component:**

```typescript
import { getSection } from '@spfn/cms/server';

export default async function HomePage() {
  const { t } = await getSection('layout', 'ko');

  return <h1>{t('nav.team')}</h1>;
}
```

**With variable substitution:**

```typescript
const { t } = await getSection('layout');
const copyright = t('footer.copyright', undefined, {
  year: new Date().getFullYear()
});
// → "© 2025 Company. All rights reserved."
```

**Client Component:**

```typescript
'use client';
import { useSection } from '@spfn/cms/client';

export default function Nav() {
  const { t, loading } = useSection('layout', { autoLoad: true });

  if (loading) return <div>Loading...</div>;

  return (
    <nav>
      <a>{t('nav.about')}</a>
      <a>{t('nav.services')}</a>
    </nav>
  );
}
```

## File Structure

```
src/cms/labels/
  layout/                  # Section: layout
    nav.json               # Category: nav
    footer.json            # Category: footer
  home/                    # Section: home
    hero.json              # Category: hero
    features.json          # Category: features
```

**How it maps:**
- Folder name = Section name
- JSON file name = Category name (for organization only)
- Inside JSON: `key` field defines the actual label key

Example:
```
src/cms/labels/layout/nav.json:
  key: "layout.nav.team" → t('nav.team') in code
```

## JSON Label Format

```typescript
{
  "labelName": {
    "key": "section.category.name",       // Required: Unique identifier
    "defaultValue": "Text" | {...},       // Required: String or i18n object
    "description": "Optional description" // Optional: For documentation
  }
}
```

**Single language:**
```json
{
  "welcome": {
    "key": "home.welcome",
    "defaultValue": "Welcome"
  }
}
```

**Multi-language:**
```json
{
  "welcome": {
    "key": "home.welcome",
    "defaultValue": {
      "ko": "환영합니다",
      "en": "Welcome",
      "ja": "ようこそ"
    }
  }
}
```

**Variable placeholders:**
```json
{
  "greeting": {
    "key": "home.greeting",
    "defaultValue": "Hello, {name}!"
  }
}
```

Usage:
```typescript
t('greeting', undefined, { name: 'John' })
// → "Hello, John!"
```

## Configuration

### Environment Variables

Configure CMS behavior via environment variables in `.env.local`:

```bash
# Default locale (default: 'en')
SPFN_CMS_DEFAULT_LOCALE=ko

# Supported locales, comma-separated (default: 'en,ko')
SPFN_CMS_SUPPORTED_LOCALES=en,ko,ja

# Auto-detect browser language (default: true)
SPFN_CMS_DETECT_BROWSER_LANGUAGE=true
```

### Runtime Configuration

Override configuration at runtime (mainly for testing):

```typescript
import { configureCms, getCmsConfig } from '@spfn/cms';

// Get current configuration
const config = getCmsConfig();
console.log(config.defaultLocale);      // 'ko'
console.log(config.supportedLocales);   // ['ko', 'en']

// Update configuration
configureCms({
  defaultLocale: 'en',
  supportedLocales: ['en', 'ko', 'ja'],
  detectBrowserLanguage: false
});
```

## Locale Management

### Automatic Locale Detection

The CMS automatically manages user locale with the following priority:

1. **Cookie** - User's explicitly selected locale (persisted)
2. **Browser Language** - Auto-detected from `Accept-Language` header (if enabled)
3. **Default Locale** - System default from environment variables

### Server Actions (`@spfn/cms/actions`)

Use Server Actions for locale management in both server and client components:

**Get current locale:**

```typescript
// Server Component
import { getLocale } from '@spfn/cms/actions';

export default async function RootLayout({ children }) {
  const locale = await getLocale();

  return <html lang={locale}>{children}</html>;
}
```

```typescript
// Client Component
'use client';
import { getLocale } from '@spfn/cms/actions';
import { useEffect, useState } from 'react';

export default function LanguageSwitcher() {
  const [locale, setLocale] = useState('');

  useEffect(() => {
    getLocale().then(setLocale);
  }, []);

  return <div>Current: {locale}</div>;
}
```

**Change locale:**

```typescript
import { setLocale } from '@spfn/cms/actions';

async function changeLanguage(newLocale: string) {
  await setLocale(newLocale);
  window.location.reload(); // Reload to apply changes
}
```

**Get supported locales:**

```typescript
import { getLocales } from '@spfn/cms/actions';

const locales = await getLocales(); // ['ko', 'en', 'ja']
```

### Auto-detect Locale in Server Components

When `locale` is not specified, `getSection()` automatically uses the detected locale:

```typescript
import { getSection } from '@spfn/cms/server';

// Auto-detects locale from cookie → browser → default
const { t } = await getSection('home');

// Or explicitly specify locale
const { t: tEn } = await getSection('home', 'en');
```

## Documentation

- **[Label Auto-Sync Guide](./LABEL_SYNC_GUIDE.md)** - Detailed configuration guide
- **[Examples](./examples/)** - Usage examples

## Architecture

```
JSON Files (src/cms/labels/**/*.json)
              ↓
      loadLabelsFromJson()
              ↓
    ┌─────────────────────┐
    │ LabelSyncGenerator  │ ← File watcher (development)
    │ initLabelSync()     │ ← Server startup
    └─────────────────────┘
              ↓
          syncAll()
              ↓
    ┌─────────────────────┐
    │   PostgreSQL DB     │
    │   - cms_labels      │
    │   - published_cache │ ⭐ Used by API
    └─────────────────────┘
              ↓ HTTP API
    ┌─────────────────────┐
    │  Application        │
    │  - getSection()     │
    │  - useSection()     │
    └─────────────────────┘
```

## API Reference

### Server-side API

- `getSection(section, locale?)` - Get section labels (auto-detects locale if not specified)
- `getSections(sections, locale?)` - Get multiple sections (auto-detects locale if not specified)
- `initLabelSync(options?)` - Sync labels on server startup

### Server Actions API (`@spfn/cms/actions`)

Available for both server and client components:

- `getLocale()` - Get current locale (cookie → browser → default)
- `setLocale(locale)` - Set locale (saves to cookie)
- `getLocales()` - Get supported locale list
- `LOCALE_COOKIE_KEY` - Locale cookie key constant

### Configuration API

- `getCmsConfig()` - Get current CMS configuration
- `configureCms(config)` - Update configuration (runtime)
- `resetCmsConfig()` - Reset configuration to defaults

### Client-side API (`@spfn/cms/client`)

- `useSection(section, options?)` - Section labels hook
- `useSections(sections)` - Multiple sections hook
- `useCmsStore()` - CMS store hook
- `cmsApi` - CMS API client
- `InitCms` - Client initialization component

### Sync API

- `loadLabelsFromJson(labelsDir)` - Load labels from JSON files
- `syncAll(sections, options?)` - Sync all sections
- `syncSection(definition, options?)` - Sync specific section

### Codegen Integration

- `createLabelSyncGenerator(config?)` - Generator factory
- `LabelSyncGenerator` - Generator class

## Development Workflow

1. **Create/Edit JSON files** in `src/cms/labels/`
2. **Auto-sync happens** (if dev server is running)
3. **Labels immediately available** via `getSection()` or `useSection()`

**Example:**

```bash
# Terminal 1: Start dev server
pnpm dev

# Terminal 2: Edit label file
echo '{"test": {"key": "layout.test", "defaultValue": "Test"}}' > src/cms/labels/layout/test.json

# Auto-sync triggers
# ✅ Label sync completed
#    Created: 1
```

## License

MIT