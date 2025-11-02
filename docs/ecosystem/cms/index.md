---
title: "Introduction"
description: "Content Management System for Next.js with JSON-based labels and automatic database synchronization"
order: 1
parent: "cms"
parentTitle: "@spfn/cms"
available: true
---

# @spfn/cms

Content Management System for Next.js with JSON-based labels and automatic database synchronization.

## Overview

@spfn/cms is a production-ready CMS system that bridges JSON file definitions with a PostgreSQL database, providing developer-friendly content management with full internationalization support.

## Features

- 📁 **JSON file-based labels** - Simple file structure for label management
- 🔄 **Auto-sync to database** - On server startup and during development
- 🌐 **Multi-language support** - 50+ languages with automatic locale detection
- 🍪 **Cookie-based locale management** - Automatic locale detection and persistence
- 📦 **Folder-based structure** - Better organization by sections
- 🔥 **Hot reload** - File changes sync automatically during development
- 💾 **Published cache** - 17x faster queries (5ms vs 87ms)
- ⚡ **Server Actions** - Client-side locale management
- 📝 **Draft system** - User-specific drafts for concurrent editing
- 🕐 **Version control** - Track all changes with audit logs
- 🛠️ **Built on Drizzle ORM** - Type-safe database access

## Installation

### Recommended: Using Superfunction CLI

```bash
pnpm spfn add @spfn/cms
```

This command will:
1. ✅ Install the package
2. ✅ Discover CMS database schemas automatically
3. ✅ Generate migrations for 6 CMS tables
4. ✅ Apply migrations to your database
5. ✅ Configure auto-sync generator

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

## Quick Start

### 1. Create Label Files

Create JSON files organized by sections:

```
src/lib/labels/
  layout/              ← Section name
    nav.json           ← Category
    footer.json
  home/
    hero.json
```

**Example:** `src/lib/labels/home/hero.json`

```json
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

Configure `src/server/server.config.ts`:

```typescript
import type { ServerConfig } from '@spfn/core/server';
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
  const { t, loading } = useSection('layout', { autoLoad: true });
  if (loading) return <div>Loading...</div>;
  return <nav><a>{t('nav.about')}</a></nav>;
}
```

## Architecture

```
JSON Files (src/lib/labels/**/*.json)
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
    │   - published_cache │ ⭐ Primary read source
    └─────────────────────┘
              ↓ HTTP API
    ┌─────────────────────┐
    │  Application        │
    │  - getSection()     │ (Server Components)
    │  - useSection()     │ (Client Components)
    └─────────────────────┘
```

## Documentation

### Getting Started
- **[Getting Started](./getting-started.md)** - Setup and basic usage
- **[Label Sync Guide](./label-sync.md)** - Auto-sync configuration and options

### Features
- **[Advanced Features](./advanced-features.md)** - Breakpoints, value types, InitCms, Draft Mode
- **[Locale Management](./locale-management.md)** - Complete guide to 50+ languages
- **[Draft & Versioning](./draft-versioning.md)** - Draft system, version control, audit logs

### Reference
- **[API Reference](./api-reference.md)** - Complete API documentation

## Configuration

### Environment Variables

```bash
# Default locale (default: 'en')
SPFN_CMS_DEFAULT_LOCALE=ko

# Supported locales, comma-separated (default: 'en,ko')
SPFN_CMS_SUPPORTED_LOCALES=en,ko,ja

# Auto-detect browser language (default: true)
SPFN_CMS_DETECT_BROWSER_LANGUAGE=true
```

### Runtime Configuration

```typescript
import { configureCms, getCmsConfig } from '@spfn/cms';

// Get current configuration
const config = getCmsConfig();

// Update configuration
configureCms({
  defaultLocale: 'en',
  supportedLocales: ['en', 'ko', 'ja'],
  detectBrowserLanguage: false
});
```

## Entry Points

### `@spfn/cms`
Common exports (server + client safe).

```typescript
import { getCmsConfig, DEFAULT_LABELS_DIR, getLocaleInfo } from '@spfn/cms';
```

### `@spfn/cms/server`
Server-side only exports.

```typescript
import { getSection, getSections, initLabelSync } from '@spfn/cms/server';
```

### `@spfn/cms/client`
Client-side only exports.

```typescript
import { useSection, useSections, InitCms } from '@spfn/cms/client';
```

### `@spfn/cms/actions`
Server Actions (works in both server and client).

```typescript
import { getLocale, setLocale, getLocales } from '@spfn/cms/actions';
```

### `@spfn/cms/api`
Management API (admin only).

```typescript
import { cmsApi } from '@spfn/cms/api';
```

## Performance

The CMS uses a **published cache** for optimal read performance:

- **Without cache**: 87ms (JOIN queries across multiple tables)
- **With cache**: 5ms (Direct JSONB read from single table)
- **Speedup**: 17x faster

The cache is automatically updated when:
- Labels are synced from JSON files
- Versions are published
- Content is modified via admin API

## Next Steps

- [Getting Started Guide](./getting-started.md) - Detailed setup instructions
- [Label Sync Guide](./label-sync.md) - Configure auto-sync behavior
- [Advanced Features](./advanced-features.md) - Learn about breakpoints, value types, and more
- [API Reference](./api-reference.md) - Complete API documentation

## License

MIT