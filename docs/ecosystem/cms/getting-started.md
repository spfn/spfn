---
title: "Getting Started"
description: "Complete setup guide for @spfn/cms including installation, configuration, and first label"
order: 2
parent: "cms"
available: true
---

# Getting Started with @spfn/cms

Complete setup guide for installing and configuring @spfn/cms in your Next.js project.

## Prerequisites

- Next.js 15+ (App Router)
- PostgreSQL database
- Node.js 18.18.0+
- pnpm 8.0.0+

## Installation

### Option 1: Automatic Setup (Recommended)

The Superfunction CLI handles everything automatically:

```bash
pnpm spfn add @spfn/cms
```

This command will:
1. Install `@spfn/cms` package
2. Detect database schemas
3. Generate 6 table migrations
4. Apply migrations to your database
5. Add label-sync generator to `.spfnrc.json`

### Option 2: Manual Setup

If you prefer manual control:

```bash
# 1. Install package
pnpm add @spfn/cms

# 2. Generate migrations
pnpm spfn db generate

# 3. Apply migrations
pnpm spfn db migrate
```

## Configuration

### 1. Environment Variables

Create or update `.env.local`:

```bash
# Database (required)
DATABASE_URL=postgresql://user:password@localhost:5432/myapp

# CMS Configuration (optional)
SPFN_CMS_DEFAULT_LOCALE=ko
SPFN_CMS_SUPPORTED_LOCALES=en,ko,ja
SPFN_CMS_DETECT_BROWSER_LANGUAGE=true
```

### 2. Enable Auto-Sync on Server Startup

Edit `src/server/server.config.ts`:

```typescript
import type { ServerConfig } from '@spfn/core/server';
import { initLabelSync } from '@spfn/cms/server';

export default {
  beforeRoutes: async (app) => {
    // Sync labels from JSON files to database
    await initLabelSync({
      verbose: true,          // Show detailed logs
      updateExisting: false,  // Don't overwrite existing labels
    });
  },
} satisfies ServerConfig;
```

### 3. Enable File Watching (Development)

Verify `.spfnrc.json` includes the label-sync generator:

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

This is automatically added by `spfn add @spfn/cms`.

## Creating Your First Label

### 1. Create Directory Structure

```bash
mkdir -p src/lib/labels/home
```

### 2. Create a Label File

Create `src/lib/labels/home/hero.json`:

```json
{
  "title": {
    "key": "home.hero.title",
    "defaultValue": "Welcome to Our Site"
  },
  "subtitle": {
    "key": "home.hero.subtitle",
    "defaultValue": "Build amazing things with Next.js"
  }
}
```

### 3. Start Development Server

```bash
pnpm dev
```

You should see:

```
🔄 Initializing label sync...
[home] Found 2 labels in definition
[home] Found 0 labels in DB
  [CREATE] home.hero.title
  [CREATE] home.hero.subtitle
  [CACHE] Updating published cache for section: home

✅ Label sync completed
   Created: 2
```

### 4. Use Labels in Your App

**Server Component** (`app/page.tsx`):

```typescript
import { getSection } from '@spfn/cms/server';

export default async function HomePage() {
  const { t } = await getSection('home');

  return (
    <div>
      <h1>{t('hero.title')}</h1>
      <p>{t('hero.subtitle')}</p>
    </div>
  );
}
```

**Client Component**:

```typescript
'use client';
import { useSection } from '@spfn/cms/client';

export default function Hero() {
  const { t, loading } = useSection('home', { autoLoad: true });

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>{t('hero.title')}</h1>
      <p>{t('hero.subtitle')}</p>
    </div>
  );
}
```

## Adding Multi-Language Support

### 1. Update Your Label File

Edit `src/lib/labels/home/hero.json`:

```json
{
  "title": {
    "key": "home.hero.title",
    "defaultValue": {
      "ko": "우리 사이트에 오신 것을 환영합니다",
      "en": "Welcome to Our Site",
      "ja": "私たちのサイトへようこそ"
    }
  },
  "subtitle": {
    "key": "home.hero.subtitle",
    "defaultValue": {
      "ko": "Next.js로 놀라운 것들을 만드세요",
      "en": "Build amazing things with Next.js",
      "ja": "Next.jsで素晴らしいものを作ろう"
    }
  }
}
```

### 2. Configure Locales

Update `.env.local`:

```bash
SPFN_CMS_DEFAULT_LOCALE=en
SPFN_CMS_SUPPORTED_LOCALES=en,ko,ja
```

### 3. Use Locale Detection

The CMS automatically detects user locale with this priority:

1. **Cookie** (`spfn-locale`) - User's selected locale
2. **Browser Language** - From `Accept-Language` header
3. **Default Locale** - From environment variables

**Server Component** (auto-detects):

```typescript
const { t } = await getSection('home');
// Automatically uses detected locale
```

**Server Component** (explicit):

```typescript
const { t } = await getSection('home', 'ko');
// Force Korean
```

**Client Component** (with locale switcher):

```typescript
'use client';
import { setLocale } from '@spfn/cms/client';

export function LanguageSwitcher() {
  const handleChange = async (locale: string) => {
    await setLocale(locale);
    window.location.reload();
  };

  return (
    <select onChange={(e) => handleChange(e.target.value)}>
      <option value="en">English</option>
      <option value="ko">한국어</option>
      <option value="ja">日本語</option>
    </select>
  );
}
```

## File Structure

Organize labels by sections and categories:

```
src/lib/labels/
  layout/                  # Section: layout
    nav.json               # Navigation labels
    footer.json            # Footer labels
  home/                    # Section: home
    hero.json              # Hero section labels
    features.json          # Features section labels
  about/                   # Section: about
    team.json              # Team labels
```

**How it maps:**
- Folder name = Section name (used in `getSection()`)
- JSON file name = Category (for organization only)
- `key` field = Full label identifier

Example:
```
File: src/lib/labels/layout/nav.json
Key:  "layout.nav.about"
Use:  t('nav.about')  // in getSection('layout')
```

## Variable Substitution

Labels support variable placeholders:

**Label definition:**

```json
{
  "welcome": {
    "key": "home.welcome",
    "defaultValue": "Welcome back, {name}!"
  },
  "copyright": {
    "key": "footer.copyright",
    "defaultValue": "© {year} Company. All rights reserved."
  }
}
```

**Usage:**

```typescript
const { t } = await getSection('home');

t('welcome', undefined, { name: 'John' });
// → "Welcome back, John!"

t('footer.copyright', undefined, { year: 2025 });
// → "© 2025 Company. All rights reserved."
```

## Development Workflow

### 1. Hot Reload

When you modify label files, they automatically sync:

```bash
# Edit file
vim src/lib/labels/home/hero.json

# Watch terminal output:
[label-sync] Label file change { file: 'src/lib/labels/home/hero.json' }
[home] Found 2 labels in definition
  [UPDATE] home.hero.title
  [CACHE] Updating published cache for section: home
[label-sync] Label sync completed
```

### 2. Adding New Labels

Just create or update JSON files:

```json
// src/lib/labels/home/cta.json
{
  "button": {
    "key": "home.cta.button",
    "defaultValue": "Get Started"
  }
}
```

The label syncs automatically, no restart needed!

### 3. Removing Labels

Delete from JSON file:

```bash
# Remove label definition from JSON
# It remains in DB (safe by default)
```

To actually delete from database:

```typescript
await initLabelSync({
  removeUnused: true,   // ⚠️ Use with caution!
  dryRun: true,         // Preview first
  verbose: true
});
```

## Troubleshooting

### Labels not syncing

**Check these:**

1. JSON file location: `src/lib/labels/**/*.json`
2. Server running: `pnpm dev`
3. Generator enabled: Check `.spfnrc.json`
4. Valid JSON: Check for syntax errors

### Database connection failed

```bash
# Verify DATABASE_URL
echo $DATABASE_URL

# Test connection
pnpm spfn db migrate
```

### File changes not detected

```bash
# Restart dev server
# Or run codegen manually:
pnpm spfn codegen run --watch
```

## Next Steps

Now that you have basic setup working:

- **[Label Sync Guide](./label-sync.md)** - Advanced sync options and strategies
- **[Advanced Features](./advanced-features.md)** - Breakpoints, value types, Draft Mode
- **[Locale Management](./locale-management.md)** - Deep dive into i18n features
- **[API Reference](./api-reference.md)** - Complete API documentation

## Common Patterns

### Root Layout with Locale

```typescript
// app/layout.tsx
import { getLocale } from '@spfn/cms/actions';
import { getSections } from '@spfn/cms/server';
import { InitCms } from '@spfn/cms/client';

export default async function RootLayout({ children }) {
  const locale = await getLocale();
  const sections = await getSections(['layout', 'common']);

  return (
    <html lang={locale}>
      <body>
        <InitCms sections={sections} />
        {children}
      </body>
    </html>
  );
}
```

### Navigation with Locale Switcher

```typescript
// components/Nav.tsx
'use client';
import { useSection } from '@spfn/cms/client';
import { LanguageSwitcher } from './LanguageSwitcher';

export function Nav() {
  const { t } = useSection('layout');

  return (
    <nav>
      <a href="/about">{t('nav.about')}</a>
      <a href="/services">{t('nav.services')}</a>
      <LanguageSwitcher />
    </nav>
  );
}
```

### Server Component with Multiple Sections

```typescript
// app/page.tsx
import { getSections } from '@spfn/cms/server';

export default async function Page() {
  const sections = await getSections(['home', 'layout']);

  return (
    <div>
      <header>{sections.layout.t('nav.home')}</header>
      <main>
        <h1>{sections.home.t('hero.title')}</h1>
      </main>
    </div>
  );
}
```