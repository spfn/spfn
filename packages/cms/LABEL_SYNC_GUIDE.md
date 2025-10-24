# Label Auto-Sync Guide

This guide explains how to use the JSON file-based label auto-synchronization feature in `@spfn/cms`.

## Overview

When you define labels in JSON files, they are automatically synchronized with the database:

1. **Auto-sync on server startup**: `initLabelSync()` - Runs once when the server starts
2. **File watching during development**: `LabelSyncGenerator` - Automatically re-syncs when label files change

---

## 1. Auto-Sync on Server Startup

### Configuration

Use the `beforeRoutes` hook in your `src/server/server.config.ts` file:

```typescript
import type { ServerConfig } from '@spfn/core/server';
import { initLabelSync } from '@spfn/cms';

export default {
  beforeRoutes: async (app) => {
    // Auto-sync labels on server startup
    await initLabelSync({
      verbose: true,          // Output progress logs
      updateExisting: false,  // Don't update existing labels (default)
      labelsDir: 'src/cms/labels',  // JSON file directory (default)
    });
  },
} satisfies ServerConfig;
```

### Options

```typescript
interface SyncOptions {
  // Dry run - Output changes without applying them
  dryRun?: boolean;

  // Whether to update defaultValue of existing labels
  updateExisting?: boolean;

  // Whether to remove unused labels
  removeUnused?: boolean;

  // Verbose output (automatically enabled in development)
  verbose?: boolean;

  // Label directory path
  labelsDir?: string;
}
```

### Output Example

```
🔄 Initializing label sync...

[layout] Found 5 labels in definition
[layout] Found 5 labels in DB
[home] Found 12 labels in definition
[home] Found 10 labels in DB
  [CREATE] home.hero.title
  [CREATE] home.hero.subtitle
  [CACHE] Updating published cache for section: home

✅ Label sync completed

   Sections: 2
   Created:  2
   Updated:  0
   Unchanged: 13
```

---

## 2. File Watching + Auto-Sync During Development

### .spfnrc.json Configuration (Auto-configured)

The label-sync generator is automatically added to your project's `.spfnrc.json` file:

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

This configuration is automatically created when you run `pnpm spfn add @spfn/cms`.

### Running the Development Server

```bash
# Run dev server with codegen watch mode
spfn dev

# Or
pnpm dev
```

When you modify label files (`src/cms/labels/**/*.json`), they are automatically synchronized to the database.

---

## 3. Label Definition Examples

### File Structure

```
src/cms/labels/
  layout/              # Section name
    nav.json           # Category
    footer.json
  home/
    hero.json
    features.json
```

### Basic Labels

`src/cms/labels/layout/nav.json`:

```json
{
  "about": {
    "key": "layout.nav.about",
    "defaultValue": "About",
    "description": "Navigation link for About page"
  },
  "services": {
    "key": "layout.nav.services",
    "defaultValue": "Services"
  },
  "team": {
    "key": "layout.nav.team",
    "defaultValue": "Team"
  }
}
```

### Multi-language Labels

`src/cms/labels/home/hero.json`:

```json
{
  "title": {
    "key": "home.hero.title",
    "defaultValue": {
      "ko": "혁신적인 솔루션",
      "en": "Innovative Solutions"
    },
    "description": "Main hero title"
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

### Variable Substitution

`src/cms/labels/layout/footer.json`:

```json
{
  "copyright": {
    "key": "layout.footer.copyright",
    "defaultValue": "© {year} Company. All rights reserved.",
    "description": "Copyright text with year variable"
  },
  "greeting": {
    "key": "layout.footer.greeting",
    "defaultValue": "Welcome back, {name}!"
  }
}
```

**How it works:**

When you save this file:
1. **On server startup**: `initLabelSync()` automatically registers it in the DB
2. **During development**: File changes trigger `LabelSyncGenerator` to auto-sync

---

## 4. Workflow Examples

### Development Workflow

1. **Start server**
   ```bash
   pnpm dev
   ```
   → `initLabelSync()` runs → All labels synchronized

2. **Add/modify label files**
   ```bash
   # Create new label file
   cat > src/cms/labels/layout/test.json <<EOF
   {
     "newLabel": {
       "key": "layout.test.new",
       "defaultValue": "New Label"
     }
   }
   EOF
   ```
   → `LabelSyncGenerator` detects → Auto re-sync

3. **Check results**
   ```
   [label-sync] Label file change { file: 'src/cms/labels/layout/test.json' }
   [label-sync] Found 1 sections
   [layout] Found 1 labels in definition
   [layout] Found 0 labels in DB
     [CREATE] layout.test.new
     [CACHE] Updating published cache for section: layout
   [label-sync] Label sync completed { sections: 1, created: 1, updated: 0, errors: 0 }
   ```

### Production Deployment

```bash
# 1. Build
pnpm build

# 2. Deploy
# initLabelSync() runs automatically on server startup
# (updateExisting: false since not in development mode)
```

---

## 5. Troubleshooting

### Q. Labels aren't syncing

**A.** Check the following:

1. Verify JSON files are in the `src/cms/labels/` directory
2. Verify file structure is correct (section/category.json)
3. Verify server is running in development mode (`NODE_ENV=development`)
4. Verify label-sync generator is enabled in `.spfnrc.json`

### Q. File changes aren't being detected

**A.** Verify codegen watch mode is enabled:

```bash
# Verify dev command includes codegen watch
spfn dev

# Or run separately
spfn codegen run --watch
```

### Q. I want to watch only a specific directory

**A.** Create a custom generator:

```typescript
// src/generators/label-sync.ts
import { createLabelSyncGenerator } from '@spfn/cms';

export default createLabelSyncGenerator({
  labelsDir: 'src/app/labels'  // Custom path
});
```

And modify `.spfnrc.json`:

```json
{
  "codegen": {
    "generators": [
      {
        "path": "./src/generators/label-sync.ts"
      }
    ]
  }
}
```

### Q. Is my JSON structure wrong?

**A.** Correct JSON format:

```json
{
  "labelName": {
    "key": "section.category.name",
    "defaultValue": "Text or object",
    "description": "Optional"
  }
}
```

Required fields:
- `key`: Unique identifier
- `defaultValue`: String or multi-language object

---

## 6. Best Practices

### ✅ DO

- **Sync on server startup**: Always call `initLabelSync()` in `beforeRoutes`
- **Watch during development**: Add label-sync generator to `.spfnrc.json`
- **Organize label files**: Separate folders by section, separate JSON files by category
- **Validate JSON**: Watch for syntax errors when writing JSON files
- **Clear keys**: Use `section.category.name` format for label keys

### ❌ DON'T

- Use `updateExisting: true` in production (prevents unintended overwrites)
- Manually modify the DB directly (always manage through JSON files)
- Use the same `key` in multiple sections
- Ignore JSON structure (key, defaultValue are required)

---

## 7. Import Structure

### Backend + Server Components (`@spfn/cms`)

Code that only runs on the server:

```typescript
// Server components
import { getSection, getSections } from '@spfn/cms/server';

// Backend: Sync
import { initLabelSync, syncAll, syncSection } from '@spfn/cms';

// Backend: JSON loading
import { loadLabelsFromJson } from '@spfn/cms';

// Backend: Repositories
import { cmsLabelsRepository } from '@spfn/cms';

// Backend: Codegen
import { createLabelSyncGenerator } from '@spfn/cms';
```

### Client Components (`@spfn/cms/client`)

Code that runs in the browser:

```typescript
'use client';

// Hooks
import { useSection, useSections, useCmsStore } from '@spfn/cms/client';

// API Client
import { cmsApi } from '@spfn/cms/client';

// Initializer
import { InitCms } from '@spfn/cms/client';
```

---

## 8. Architecture

```
┌────────────────────────────────────────────────────┐
│  JSON Files Layer                                  │
│  ┌───────────────────┐                            │
│  │ src/cms/labels/   │                            │
│  │   layout/         │                            │
│  │     nav.json      │                            │
│  │     footer.json   │                            │
│  │   home/           │                            │
│  │     hero.json     │                            │
│  └──────────┬────────┘                            │
└─────────────┼──────────────────────────────────────┘
              │
              │ reads
              ▼
┌─────────────────────────────────────────────────────┐
│  Sync Layer                                          │
│  ┌──────────────┐      ┌────────────────────────┐  │
│  │ initLabelSync │  ←  │ beforeRoutes Hook      │  │
│  │  (startup)    │      │  (server.config.ts)    │  │
│  └──────┬───────┘      └────────────────────────┘  │
│         │                                           │
│  ┌──────┴───────┐      ┌────────────────────────┐  │
│  │ loadLabelsFrom│  ←  │ LabelSyncGenerator     │  │
│  │ Json()       │      │  (file watcher)        │  │
│  └──────┬───────┘      └────────────────────────┘  │
│         │                                           │
│         │ sections array                            │
│         ▼                                           │
│  ┌──────────────┐                                  │
│  │ syncAll()    │                                  │
│  └──────┬───────┘                                  │
│         │ upserts                                   │
│         ▼                                           │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  Database Layer                                      │
│  ┌──────────────┐      ┌────────────────────────┐  │
│  │  cms_labels  │      │ cms_published_cache    │  │
│  └──────────────┘      └────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## References

- [CMS Package README](./README.md)
- [Sync API](./src/helpers/sync.ts)
- [Label Sync Generator](./src/generators/label-sync-generator.ts)
- [Codegen System](../core/src/codegen/README.md)