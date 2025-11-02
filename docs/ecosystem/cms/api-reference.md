---
title: "API Reference"
description: "Complete API documentation including repositories, routes, and utility functions"
order: 6
parent: "cms"
available: true
---

# API Reference

Complete API documentation for @spfn/cms including repositories, routes, and utility functions.

## Table of Contents

- [Entry Points](#entry-points)
- [Server Components API](#server-components-api)
- [Client Components API](#client-components-api)
- [Server Actions](#server-actions)
- [Management API](#management-api)
- [Repositories](#repositories)
- [Entities](#entities)
- [Utility Functions](#utility-functions)

---

## Entry Points

### `@spfn/cms`

Common exports (server + client safe).

```typescript
// Configuration
import { getCmsConfig, configureCms, resetCmsConfig } from '@spfn/cms';

// Constants
import { DEFAULT_LABELS_DIR, LOCALE_COOKIE_KEY } from '@spfn/cms';

// Locale Helpers
import { getLocaleInfo, getSupportedLocales, getFlag, getDialCode, isRTL } from '@spfn/cms';

// Types
import type { SectionData, SectionAPI, CmsConfig, LocaleInfo, SupportedLocale } from '@spfn/cms';
```

### `@spfn/cms/server`

Server-side only exports.

```typescript
// Server Components
import { getSection, getSections } from '@spfn/cms/server';

// Sync Utilities
import { initLabelSync, syncAll, syncSection, loadLabelsFromJson } from '@spfn/cms/server';

// Locale Management
import { getLocale, setLocale, getLocales, isValidLocale } from '@spfn/cms/server';

// Repositories
import {
  cmsLabelsRepository,
  cmsLabelValuesRepository,
  cmsPublishedCacheRepository,
  cmsDraftCacheRepository
} from '@spfn/cms/server';

// Entities
import {
  cmsLabels,
  cmsLabelValues,
  cmsLabelVersions,
  cmsPublishedCache,
  cmsDraftCache,
  cmsAuditLogs
} from '@spfn/cms/server';

// Generators
import { createLabelSyncGenerator } from '@spfn/cms/server';
```

### `@spfn/cms/client`

Client-side only exports.

```typescript
// Hooks
import { useSection, useSections, useCmsStore } from '@spfn/cms/client';

// Components
import { InitCms } from '@spfn/cms/client';

// Server Actions (callable from client)
import { getLocale, setLocale, getLocales } from '@spfn/cms/client';
```

### `@spfn/cms/actions`

Server Actions (works in both server and client).

```typescript
import { getLocale, setLocale, getLocales, LOCALE_COOKIE_KEY } from '@spfn/cms/actions';
```

### `@spfn/cms/api`

Management API (admin only).

```typescript
import { cmsApi } from '@spfn/cms/api';

// Auto-generated API clients
cmsApi.cmsLabels.get()
cmsApi.cmsLabelsByKey.get()
cmsApi.cmsValues.*
cmsApi.cmsPublishedCache.get()
```

---

## Server Components API

### getSection(section, locale?)

Fetch a single section with React cache.

```typescript
async function getSection(
  section: string,
  locale?: string
): Promise<SectionAPI>
```

**Parameters:**
- `section` (string) - Section name (e.g., 'home', 'layout')
- `locale` (string, optional) - Language code, auto-detects if not specified

**Returns:** `Promise<SectionAPI>`
- `t(key, defaultValue?, replace?)` - Translation function
- `data` - Raw section data

**Example:**
```typescript
import { getSection } from '@spfn/cms/server';

export default async function HomePage() {
  const { t, data } = await getSection('home');

  return (
    <div>
      <h1>{t('hero.title')}</h1>
      <p>{t('hero.subtitle', 'Default subtitle')}</p>
      <p>{t('copyright', '© {year}', { year: 2025 })}</p>
    </div>
  );
}
```

### getSections(sections, locale?)

Fetch multiple sections with single API call.

```typescript
async function getSections(
  sections: string[],
  locale?: string
): Promise<Record<string, SectionAPI>>
```

**Parameters:**
- `sections` (string[]) - Array of section names
- `locale` (string, optional) - Language code

**Returns:** `Promise<Record<string, SectionAPI>>`

**Example:**
```typescript
import { getSections } from '@spfn/cms/server';

export default async function Page() {
  const sections = await getSections(['home', 'layout']);

  return (
    <div>
      <h1>{sections.home.t('hero.title')}</h1>
      <nav>{sections.layout.t('nav.about')}</nav>
    </div>
  );
}
```

---

## Client Components API

### useSection(section, options?)

React hook for accessing section data in client components.

```typescript
function useSection(
  section: string,
  options?: {
    autoLoad?: boolean;
    locale?: string;
  }
): {
  t: (key: string, defaultValue?: any, replace?: Record<string, string | number>) => any;
  data: SectionData | undefined;
  loading: boolean;
}
```

**Parameters:**
- `section` (string) - Section name
- `options.autoLoad` (boolean) - Auto-load from API if not in store
- `options.locale` (string) - Language code (default: 'ko')

**Returns:**
- `t` - Translation function
- `data` - Section data
- `loading` - Loading state

**Example:**
```typescript
'use client';
import { useSection } from '@spfn/cms/client';

export function ClientNav() {
  const { t, loading } = useSection('layout', { autoLoad: true });

  if (loading) return <div>Loading...</div>;

  return <nav><a>{t('nav.about')}</a></nav>;
}
```

### useSections(sections)

React hook for multiple sections.

```typescript
function useSections(
  sections: string[]
): Record<string, SectionData | undefined>
```

### useCmsStore()

Direct access to Zustand store.

```typescript
interface CmsState {
  sections: Record<string, SectionData>;
  loading: Record<string, boolean>;
  setSection: (section: string, data: SectionData) => void;
  setSections: (sections: Record<string, SectionData>) => void;
  loadSection: (section: string, locale?: string) => Promise<void>;
  updateLabel: (section: string, key: string, value: any) => void;
  reset: () => void;
}
```

**Example:**
```typescript
import { useCmsStore } from '@spfn/cms/client';

function Component() {
  const loadSection = useCmsStore(state => state.loadSection);
  const reset = useCmsStore(state => state.reset);

  return (
    <button onClick={() => loadSection('home', 'en')}>
      Load Home
    </button>
  );
}
```

### InitCms

Component for initializing client store with server data.

```typescript
function InitCms(props: {
  sections: Record<string, SectionAPI>
}): null
```

**Example:**
```typescript
// app/layout.tsx
import { getSections } from '@spfn/cms/server';
import { InitCms } from '@spfn/cms/client';

export default async function RootLayout({ children }) {
  const sections = await getSections(['home', 'layout']);

  return (
    <html>
      <body>
        <InitCms sections={sections} />
        {children}
      </body>
    </html>
  );
}
```

---

## Server Actions

### getLocale()

Get current user locale (cookie → browser → default).

```typescript
async function getLocale(): Promise<string>
```

### setLocale(locale)

Set user locale (saves to cookie).

```typescript
async function setLocale(locale: string): Promise<void>
```

**Throws:** Error if locale is not supported

### getLocales()

Get list of supported locales.

```typescript
async function getLocales(): Promise<string[]>
```

### getLocaleWithInfo()

Get current locale with metadata.

```typescript
async function getLocaleWithInfo(): Promise<{
  locale: string;
  info: LocaleInfo | undefined;
}>
```

### getLocalesWithInfo()

Get all supported locales with metadata.

```typescript
async function getLocalesWithInfo(): Promise<LocaleInfo[]>
```

### isValidLocale(locale)

Check if locale is supported.

```typescript
async function isValidLocale(locale: string): Promise<boolean>
```

---

## Management API

⚠️ **Admin only** - Requires proper authentication

### cmsApi.cmsLabels

Label CRUD operations.

```typescript
// List labels
const labels = await cmsApi.cmsLabels.get({
  query?: {
    section?: string;
    key?: string;
    limit?: number;
    offset?: number;
  }
});

// Get label by ID
const label = await cmsApi.cmsLabels.getById({
  params: { id: '1' }
});

// Create label
const newLabel = await cmsApi.cmsLabels.post({
  body: {
    key: 'home.hero.title',
    section: 'home',
    type: 'text',
    createdBy: 'admin'
  }
});

// Update label
const updated = await cmsApi.cmsLabels.update({
  params: { id: '1' },
  body: {
    publishedVersion: 2
  }
});

// Delete label
await cmsApi.cmsLabels.delete({
  params: { id: '1' }
});
```

### cmsApi.cmsLabelsByKey

Get label by key instead of ID.

```typescript
const label = await cmsApi.cmsLabelsByKey.get({
  params: { key: 'home.hero.title' }
});
```

### cmsApi.cmsPublishedCache

Get published cache data.

```typescript
const cache = await cmsApi.cmsPublishedCache.get({
  query: {
    sections: 'home',      // Single or array
    locale: 'ko'
  }
});
```

---

## Repositories

### cmsLabelsRepository

Label metadata management.

```typescript
// Find all labels
const labels = await cmsLabelsRepository.findAll({
  where: eq(cmsLabels.section, 'home'),
  limit: 10,
  offset: 0
});

// Find by ID
const label = await cmsLabelsRepository.findById(1);

// Find by key
const label = await cmsLabelsRepository.findByKey('home.hero.title');

// Create
const newLabel = await cmsLabelsRepository.create({
  key: 'home.hero.title',
  section: 'home',
  type: 'text',
  publishedVersion: null,
  createdBy: 'admin'
});

// Update
await cmsLabelsRepository.update(1, {
  publishedVersion: 2
});

// Delete
await cmsLabelsRepository.delete(1);

// Find by section
const homeLabels = await cmsLabelsRepository.findBySection('home');
```

### cmsPublishedCacheRepository

Published content cache.

```typescript
// Find by section and locale
const cache = await cmsPublishedCacheRepository.findBySection('home', 'ko');

// Find multiple sections
const caches = await cmsPublishedCacheRepository.findBySections(['home', 'layout'], 'ko');

// Upsert (create or update)
await cmsPublishedCacheRepository.upsert({
  section: 'home',
  locale: 'ko',
  content: { 'home.hero.title': 'Welcome' },
  version: 1
});

// Delete
await cmsPublishedCacheRepository.delete('home', 'ko');

// Rebuild cache for all sections
await cmsPublishedCacheRepository.rebuildAll();
```

### cmsDraftCacheRepository

User draft management.

```typescript
// Find user's draft
const draft = await cmsDraftCacheRepository.findByUser('home', 'ko', 'user123');

// Upsert draft
await cmsDraftCacheRepository.upsert({
  section: 'home',
  locale: 'ko',
  userId: 'user123',
  content: { 'home.hero.title': 'Draft title...' }
});

// Find all drafts by user
const allDrafts = await cmsDraftCacheRepository.findAllByUser('user123');

// Delete draft
await cmsDraftCacheRepository.deleteByUser('home', 'ko', 'user123');

// Cleanup old drafts (30+ days)
await cmsDraftCacheRepository.cleanupOldDrafts(30);
```

### cmsLabelValuesRepository

Label value management (with locale, breakpoint, version).

```typescript
// Find values by label ID and version
const values = await cmsLabelValuesRepository.findByLabelAndVersion(1, 2);

// Create value
await cmsLabelValuesRepository.create({
  labelId: 1,
  version: 1,
  locale: 'ko',
  breakpoint: null,
  value: { type: 'text', content: 'Hello' }
});

// Update
await cmsLabelValuesRepository.update(1, {
  value: { type: 'text', content: 'Updated' }
});

// Delete
await cmsLabelValuesRepository.delete(1);
```

---

## Entities

Drizzle ORM schema definitions.

### cmsLabels

Label metadata table.

```typescript
{
  id: number;
  key: string;                  // Unique label key
  section: string;              // Section name
  type: string;                 // Label type
  publishedVersion: number | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### cmsLabelValues

Label values per locale/breakpoint.

```typescript
{
  id: number;
  labelId: number;              // FK: cms_labels
  version: number;              // Version number
  locale: string;               // Language code
  breakpoint: string | null;    // Responsive breakpoint
  value: any;                   // JSONB value
  createdAt: Date;
}
```

### cmsLabelVersions

Version history.

```typescript
{
  id: number;
  labelId: number;
  version: number;
  changelog: string | null;
  createdBy: string;
  createdAt: Date;
}
```

### cmsPublishedCache

Performance cache (17x faster).

```typescript
{
  id: number;
  section: string;
  locale: string;
  content: any;                 // JSONB: flattened labels
  version: number;
  publishedAt: Date | null;
  createdAt: Date;
}
```

### cmsDraftCache

User draft storage.

```typescript
{
  id: number;
  section: string;
  locale: string;
  userId: string;
  content: any;                 // JSONB
  updatedAt: Date;
}
```

### cmsAuditLogs

Change audit trail.

```typescript
{
  id: number;
  labelId: number | null;
  action: string;               // create | update | publish | delete...
  userId: string;
  userName: string | null;
  changes: any;                 // JSONB: { before, after }
  metadata: any;                // JSONB
  createdAt: Date;
}
```

---

## Utility Functions

### Configuration

```typescript
import { getCmsConfig, configureCms, resetCmsConfig } from '@spfn/cms';

// Get config
const config = getCmsConfig();

// Update config
configureCms({
  defaultLocale: 'en',
  supportedLocales: ['en', 'ko', 'ja'],
  detectBrowserLanguage: false
});

// Reset to env defaults
resetCmsConfig();
```

### Sync Utilities

```typescript
import { initLabelSync, syncAll, syncSection, loadLabelsFromJson } from '@spfn/cms/server';

// Initialize sync on server startup
await initLabelSync({
  verbose: true,
  updateExisting: false
});

// Load from JSON
const sections = loadLabelsFromJson('src/lib/labels');

// Sync all sections
const results = await syncAll(sections, {
  dryRun: false,
  updateExisting: true,
  removeUnused: false,
  verbose: true
});

// Sync single section
const result = await syncSection(sectionDefinition, options);
```

### Label Helpers

```typescript
import { flattenLabels, extractLabels } from '@spfn/cms/server';

// Flatten nested structure
const flat = flattenLabels({
  nav: {
    home: { key: 'layout.nav.home', defaultValue: 'Home' }
  }
});
// => [{ key: 'layout.nav.home', defaultValue: 'Home' }]

// Extract from section definition
const labels = extractLabels({
  section: 'layout',
  labels: nestedStructure
});
```

### Locale Helpers

```typescript
import { getLocaleInfo, getFlag, getDialCode, isRTL } from '@spfn/cms';

const info = getLocaleInfo('ko');
const flag = getFlag('ko');         // '🇰🇷'
const dialCode = getDialCode('ko'); // '+82'
const rtl = isRTL('ar');            // true
```

---

## Error Handling

All API calls return a union type with error:

```typescript
const response = await client.call(contract, options);

if ('error' in response) {
  console.error(response.error);
  // Handle error
  return;
}

// Success - use response data
console.log(response);
```

---

## Next Steps

- **[Advanced Features](./ADVANCED_FEATURES.md)** - Breakpoints, value types, Draft Mode
- **[Locale Management](./LOCALE_GUIDE.md)** - Complete locale guide
- **[Draft & Versioning](./DRAFT_AND_VERSIONING.md)** - Draft system and version control