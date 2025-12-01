# @spfn/cms

Type-safe Content Management System for Next.js with automatic database synchronization and published cache.

## Features

- 🎯 **Type-safe labels** - Full TypeScript support with autocomplete
- 🔄 **Auto-sync** - Database synchronization on server startup
- 🌐 **Multi-language** - Type-checked locale support
- 🍪 **Smart locale detection** - Cookie-based with automatic fallback
- 💾 **Published cache** - 17x faster queries (5ms vs 87ms)
- 🎨 **Nested structure** - Organize labels hierarchically
- 🔧 **Template variables** - Dynamic content with `{placeholder}` syntax
- 📝 **Draft & versioning** - Version control and audit logs

## Installation

```bash
pnpm spfn add @spfn/cms
```

## Quick Start

### 1. Define Labels & Configuration

```typescript
// labels.ts
import { defineLabelConfig, defineLabels, createCmsClient } from '@spfn/cms';

// Configure locales
export const labelConfig = defineLabelConfig({
    locales: ['en', 'ko'] as const,
    defaultLocale: 'ko',
    fallbackLocale: 'en'
});

// Define labels with nested structure
export const labelsDefinition = defineLabels({
    home: {
        hero: {
            title: { en: "Welcome", ko: "환영합니다" },
            subtitle: { en: "Start your journey", ko: "여정을 시작하세요" },
            greeting: { en: "Hello {name}!", ko: "{name}님 안녕하세요!" }
        },
        cta: { en: "Get Started", ko: "시작하기" }
    },
    about: {
        title: { en: "About Us", ko: "회사 소개" }
    }
});

// Create client with API, getLabels, and format
export const { api, getLabels, format } = createCmsClient(
    labelsDefinition,
    labelConfig
);
```

### 2. Enable Auto-Sync

```typescript
// server.config.ts
import { defineServerConfig } from '@spfn/core/server';
import { syncLabels } from '@spfn/cms/server';
import { labelsDefinition } from './labels';


// Option 1: Single definition
export default defineServerConfig()
    .lifecycle({
        afterInfrastructure: async () => {
            await syncLabels(labelsDefinition);
        }
    })
    .build();

// Option 2: Multiple definitions (organized in separate files)
import { homeLabels } from './labels/home';
import { aboutLabels } from './labels/about';

export default defineServerConfig()
    .lifecycle({
        afterInfrastructure: async () => {
            await syncLabels([homeLabels, aboutLabels]);
        }
    })
    .build();
```

### 3. Use in Your App

**Server Component:**

```typescript
import { getLabels, format } from '@/labels';

export default async function HomePage() {
    // Single section
    const labels = await getLabels('home');

    // Multiple sections
    const labels = await getLabels(['home', 'about']);

    return (
        <div>
            <h1>{labels.home.hero.title}</h1>
            <p>{labels.home.hero.subtitle}</p>
            <button>{labels.home.cta}</button>

            {/* Template variables */}
            <p>{format(labels.home.hero.greeting, { name: 'John' })}</p>
            {/* Output: "John님 안녕하세요!" */}
        </div>
    );
}
```

**Locale Management:**

```typescript
'use client';
import { setLocale } from '@spfn/cms/actions';

export function LanguageSwitcher() {
    return (
        <div>
            <button onClick={() => setLocale('ko')}>한국어</button>
            <button onClick={() => setLocale('en')}>English</button>
        </div>
    );
}
```

## Key Features

### 🎯 Type Safety

```typescript
const labels = await getLabels('home');

// ✅ IDE autocomplete works!
labels.home.hero.title; // OK
labels.home.hero.titlee; // ❌ Compile error

// ✅ Section names are type-checked
await getLabels('home'); // OK
await getLabels('homee'); // ❌ Compile error
```

### 🎨 Nested Structure

```typescript
defineLabels({
    features: {
        analytics: {
            title: { en: "Analytics", ko: "분석" },
            description: { en: "Track metrics", ko: "지표 추적" }
        },
        security: {
            title: { en: "Security", ko: "보안" }
        }
    }
});

// Access with object notation
const labels = await getLabels('features');
labels.features.analytics.title; // "분석" (auto locale)
labels.features.analytics.description; // "지표 추적"
```

### 🔧 Template Variables

```typescript
defineLabels({
    home: {
        welcome: {
            en: "Welcome {name}, you have {count} messages",
            ko: "{name}님, {count}개의 메시지가 있습니다"
        }
    }
});

const labels = await getLabels('home');
const text = labels.home.welcome;

format(text, { name: "John", count: 5 });
// Output: "John님, 5개의 메시지가 있습니다"
```

### 🍪 Smart Locale Detection

Automatic locale detection with priority:
1. User's cookie (`cms-locale`)
2. Config's `defaultLocale`
3. Final fallback: `'en'`

```typescript
// User sets locale (saved to cookie)
await setLocale('ko');

// Automatically uses 'ko' locale
const labels = await getLabels('home');
labels.home.hero.title; // "환영합니다" (Korean)

// Switch to English
await setLocale('en');
const labels2 = await getLabels('home');
labels2.home.hero.title; // "Welcome" (English)
```

### 🔄 Auto-Sync

Labels synchronize automatically on server startup:
- ✅ Creates new labels
- ✅ Updates changed labels (deep equality check)
- ✅ Skips unchanged labels (performance)
- ✅ Rebuilds published cache
- ⚠️ Optionally removes orphaned labels

## API Reference

### createCmsClient()

Factory function to create CMS client with API, getLabels, and format utilities.

```typescript
const { api, getLabels, format } = createCmsClient(labelsDefinition, labelConfig);
```

**Returns:**
- `api` - API client for CMS routes
- `getLabels(sections)` - Fetch labels by section(s)
- `format(template, vars)` - Template variable substitution

### getLabels()

Fetch labels from published cache with automatic locale detection.

```typescript
// Single section
const labels = await getLabels('home');

// Multiple sections
const labels = await getLabels(['home', 'about']);
```

**Features:**
- Auto locale detection (cookie → defaultLocale → 'en')
- Section filtering (only processes requested sections)
- Merges published cache with defaults
- Returns type-safe nested object

**Performance:**
- Only requested sections are processed (not entire labelsDefinition)
- 10x faster when requesting 1 section out of 10
- Reduces CPU and memory usage proportionally

### format()

Replace template variables in strings.

```typescript
format("Hello {name}!", { name: "John" }); // "Hello John!"
format("{count} items", { count: 5 }); // "5 items"
```

**Syntax:** `{variableName}` - Supports strings and numbers

### setLocale() / getLocale()

Server actions for locale management (cookie-based).

```typescript
// Set user's preferred locale
await setLocale('ko'); // Saves to 'cms-locale' cookie

// Get current locale
const locale = await getLocale(defaultLocale); // Returns: cookie → defaultLocale → 'en'
```

**Cookie settings:**
- Name: `cms-locale`
- Max age: 1 year
- HttpOnly, Secure (production), SameSite: lax

### syncLabels()

Synchronize labels to database (server-side only).

```typescript
await syncLabels(labelsDefinition, {
    removeOrphaned: false, // Delete labels not in code
    dryRun: false // Preview changes without applying
});
```

**Returns:** `{ added, updated, removed, unchanged }`

## Architecture

### Database Schema

```
cms_labels (metadata)
  ├─ id, key, section, type, defaultValue
  └─ publishedVersion

cms_label_values (actual content)
  ├─ labelId, version, locale, breakpoint
  └─ value (JSONB)

cms_published_cache (performance)
  ├─ section, locale, content (JSONB)
  └─ version (for cache invalidation)

cms_audit_logs (tracking)
  └─ action, userId, changes, metadata
```

### Query Flow

1. **getLabels()** → published_cache (single query, 5ms)
2. **Fallback** → bindLocale(defaults)
3. **Merge** → cache overrides defaults
4. **Return** → type-safe nested object

## Performance

- **Published cache:** 5ms (vs 87ms with JOINs) - 17x faster
- **N+1 prevention:** Bulk section queries with `inArray()`
- **Section filtering:** Only requested sections processed (10x faster for selective access)
- **Unchanged labels:** Skipped during sync (deep equality check)
- **Client caching:** Version-based invalidation

### Example: Large Scale

```typescript
// 10 sections with 100 labels each = 1,000 total labels
const labelsDefinition = {
    home: { /* 100 labels */ },
    about: { /* 100 labels */ },
    products: { /* 100 labels */ },
    // ... 7 more sections
};

// Only request 'home'
const labels = await getLabels('home');

// ✅ Performance: Processes only 100 labels (10% of total)
// ❌ Without filtering: Would process all 1,000 labels
```

**Benefits:**
- CPU usage: 10x reduction (100 vs 1,000 labels)
- Memory usage: 10x reduction
- Response time: Proportionally faster

## Development Status

This package is currently in alpha. APIs may change.

## License

MIT
