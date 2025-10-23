# @spfn/cms

Content Management System for Next.js with type-safe labels and automatic database synchronization.

## Features

- 🎯 **Type-safe labels** with TypeScript
- 🔄 **Auto-sync to database** on server startup and during development
- 🌐 **Multi-language support** (i18n)
- 📦 **Nested label structure** for better organization
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

### 1. Define Labels

Create label definitions using `defineLabelSection`:

```typescript
// src/labels/layout.ts
import { defineLabelSection } from '@spfn/cms';

export const layoutLabels = defineLabelSection('layout', {
  nav: {
    home: {
      key: 'layout.nav.home',
      defaultValue: { ko: '홈', en: 'Home' },
    },
    about: {
      key: 'layout.nav.about',
      defaultValue: { ko: '소개', en: 'About' },
    },
  },
});
```

### 2. Enable Auto-Sync on Server Startup

Configure `src/server/server.config.ts`:

```typescript
import type { ServerConfig } from '@spfn/core/server';
import { initLabelSync } from '@spfn/cms';

export default {
  beforeRoutes: async (app) => {
    await initLabelSync({ verbose: true });
  },
} satisfies ServerConfig;
```

### 3. Enable Auto-Sync During Development

Create `src/generators/label-sync.ts`:

```typescript
import { createLabelSyncGenerator } from '@spfn/cms';

export default createLabelSyncGenerator();
```

Add to `.spfnrc.json`:

```json
{
  "codegen": {
    "generators": [
      { "path": "./src/generators/label-sync.ts" }
    ]
  }
}
```

### 4. Use Labels in Your App

```typescript
// Server Component
import { getSection } from '@spfn/cms';

export default async function HomePage() {
  const labels = await getSection('layout', 'ko');

  return <h1>{labels.t('nav.home')}</h1>;
}
```

```typescript
// Client Component
'use client';
import { useSection } from '@spfn/cms/client';

export default function Nav() {
  const { t } = useSection('layout');

  return <nav>{t('nav.home')}</nav>;
}
```

## Documentation

- **[Label Auto-Sync Guide](./LABEL_SYNC_GUIDE.md)** - 자세한 설정 가이드
- **[Examples](./examples/)** - 실제 사용 예제들

## Examples

프로젝트의 `examples/` 디렉토리에서 다음 예제들을 확인할 수 있습니다:

- `server.config.ts` - 서버 설정 예제
- `label-sync-generator.ts` - 제너레이터 설정 예제
- `labels-example.ts` - 라벨 정의 예제
- `sync-labels-script.ts` - 수동 동기화 스크립트
- `.spfnrc.json` - Codegen 설정 예제

## Architecture

```
defineLabelSection() → registeredSections
                            ↓
                    ┌───────┴────────┐
                    ↓                ↓
            initLabelSync()   LabelSyncGenerator
            (server startup)   (file watcher)
                    ↓                ↓
                    └───────┬────────┘
                            ↓
                       syncAll()
                            ↓
                    ┌───────┴────────┐
                    ↓                ↓
              cms_labels    cms_published_cache
```

## API Reference

### Label Definition

- `defineLabelSection(section, labels)` - 라벨 섹션 정의
- `getRegisteredSections()` - 등록된 섹션 조회
- `flattenLabels(labels)` - 중첩 구조 평탄화

### Sync API

- `initLabelSync(options?)` - 서버 시작 시 sync
- `syncAll(options?)` - 모든 섹션 동기화
- `syncSection(definition, options?)` - 특정 섹션 동기화

### Server-side API

- `getSection(section, locale)` - 섹션 라벨 조회
- `getSections(sections, locale)` - 다중 섹션 조회

### Client-side API (`@spfn/cms/client`)

- `useSection(section)` - 섹션 라벨 훅
- `useSections(sections)` - 다중 섹션 훅
- `useCmsStore()` - CMS 스토어 훅
- `cmsApi` - CMS API 클라이언트
- `InitCms` - 클라이언트 초기화 컴포넌트

### Codegen Integration

- `createLabelSyncGenerator()` - 제너레이터 팩토리
- `LabelSyncGenerator` - 제너레이터 클래스

## License

MIT