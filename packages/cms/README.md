# @spfn/cms

Content Management System for Next.js with JSON-based labels and automatic database synchronization.

## Features

- 📁 **JSON file-based labels** - Simple file structure for label management
- 🔄 **Auto-sync to database** on server startup and during development
- 🌐 **Multi-language support** (i18n)
- 📦 **Folder-based structure** for better organization
- 🔥 **Hot reload** during development
- 💾 **Published cache** for optimal performance
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
  "whyFutureplay": {
    "key": "layout.nav.why-futureplay",
    "defaultValue": "Why FuturePlay",
    "description": "Navigation link for Why FuturePlay page"
  },
  "ourCompanies": {
    "key": "layout.nav.our-companies",
    "defaultValue": "Our Companies",
    "description": "Navigation link for Our Companies page"
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
      "ko": "미래를 만드는 플랫폼",
      "en": "Platform for the Future"
    }
  },
  "subtitle": {
    "key": "home.hero.subtitle",
    "defaultValue": {
      "ko": "혁신적인 게임과 서비스로 세상을 바꿉니다",
      "en": "Changing the world with innovative games and services"
    }
  }
}
```

**Variable substitution:** `src/cms/labels/layout/footer.json`

```json
{
  "copyright": {
    "key": "layout.footer.copyright",
    "defaultValue": "© {year} FuturePlay. All rights reserved."
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
// → "© 2025 FuturePlay. All rights reserved."
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
      <a>{t('nav.whyFutureplay')}</a>
      <a>{t('nav.ourCompanies')}</a>
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

## Documentation

- **[Label Auto-Sync Guide](./LABEL_SYNC_GUIDE.md)** - 자세한 설정 가이드
- **[Examples](./examples/)** - 실제 사용 예제들

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

- `getSection(section, locale)` - 섹션 라벨 조회
- `getSections(sections, locale)` - 다중 섹션 조회
- `initLabelSync(options?)` - 서버 시작 시 sync

### Client-side API (`@spfn/cms/client`)

- `useSection(section, options?)` - 섹션 라벨 훅
- `useSections(sections)` - 다중 섹션 훅
- `useCmsStore()` - CMS 스토어 훅
- `cmsApi` - CMS API 클라이언트
- `InitCms` - 클라이언트 초기화 컴포넌트

### Sync API

- `loadLabelsFromJson(labelsDir)` - JSON 파일에서 라벨 로드
- `syncAll(sections, options?)` - 모든 섹션 동기화
- `syncSection(definition, options?)` - 특정 섹션 동기화

### Codegen Integration

- `createLabelSyncGenerator(config?)` - 제너레이터 팩토리
- `LabelSyncGenerator` - 제너레이터 클래스

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