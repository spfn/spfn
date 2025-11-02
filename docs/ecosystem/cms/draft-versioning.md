---
title: "Draft & Versioning"
description: "Draft system, version control, audit logs, and concurrent editing"
order: 7
parent: "cms"
available: true
---

# Draft System & Version Control

Complete guide to draft management, version control, and audit logging in @spfn/cms.

## Table of Contents

- [Overview](#overview)
- [Published vs Draft Cache](#published-vs-draft-cache)
- [Draft Management](#draft-management)
- [Version Control](#version-control)
- [Audit Logs](#audit-logs)
- [Concurrent Editing](#concurrent-editing)
- [Workflows](#workflows)

---

## Overview

@spfn/cms provides a complete content management system with:

- **Draft Cache** - User-specific drafts for concurrent editing
- **Published Cache** - Production-ready content (17x faster queries)
- **Version Control** - Track all label versions with changelog
- **Audit Logs** - Complete change history with user attribution

---

## Published vs Draft Cache

### Published Cache

**Purpose**: Production content serving with optimal performance.

**Characteristics:**
- Shared by all users
- Read-only for application
- Flat structure for fast queries (5ms vs 87ms)
- Updated only on publish action
- Stored per section + locale

**Schema:**
```typescript
{
  section: string;      // 'home', 'layout', etc.
  locale: string;       // 'ko', 'en', 'ja', etc.
  content: {            // Flattened key-value pairs
    'home.hero.title': 'Welcome',
    'home.hero.subtitle': 'Get started today'
  },
  version: number;      // Current version
  publishedAt: Date;    // Publish timestamp
}
```

**Usage:**
```typescript
import { cmsPublishedCacheRepository } from '@spfn/cms/server';

// Get published content
const cache = await cmsPublishedCacheRepository.findBySection('home', 'ko');

// Used by getSection() automatically
const { t } = await getSection('home', 'ko');
```

### Draft Cache

**Purpose**: User-specific drafts for concurrent editing.

**Characteristics:**
- Per-user storage
- Read/write for editors
- Allows multiple users to edit simultaneously
- Not visible to end users
- Auto-cleanup after 30 days

**Schema:**
```typescript
{
  section: string;
  locale: string;
  userId: string;       // User ID who owns this draft
  content: {            // User's draft changes
    'home.hero.title': 'Work in progress...'
  },
  updatedAt: Date;      // Last edit time
}
```

**Usage:**
```typescript
import { cmsDraftCacheRepository } from '@spfn/cms/server';

// Save user's draft
await cmsDraftCacheRepository.upsert({
  section: 'home',
  locale: 'ko',
  userId: 'user123',
  content: { 'home.hero.title': 'Draft title...' }
});

// Load user's draft
const draft = await cmsDraftCacheRepository.findByUser('home', 'ko', 'user123');
```

---

## Draft Management

### Creating Drafts

```typescript
import { cmsDraftCacheRepository } from '@spfn/cms/server';

async function saveDraft(
  userId: string,
  section: string,
  locale: string,
  content: Record<string, any>
) {
  await cmsDraftCacheRepository.upsert({
    section,
    locale,
    userId,
    content
  });
}

// Example
await saveDraft('user123', 'home', 'ko', {
  'home.hero.title': 'Updated title',
  'home.hero.subtitle': 'Updated subtitle'
});
```

### Loading Drafts

```typescript
async function loadDraft(userId: string, section: string, locale: string) {
  const draft = await cmsDraftCacheRepository.findByUser(section, locale, userId);

  if (!draft) {
    return null;
  }

  return draft.content;
}

// Example
const content = await loadDraft('user123', 'home', 'ko');
// { 'home.hero.title': 'Updated title', ... }
```

### Listing User Drafts

```typescript
async function getUserDrafts(userId: string) {
  const drafts = await cmsDraftCacheRepository.findAllByUser(userId);

  return drafts.map(draft => ({
    section: draft.section,
    locale: draft.locale,
    lastUpdated: draft.updatedAt,
    contentCount: Object.keys(draft.content).length
  }));
}

// Example
const userDrafts = await getUserDrafts('user123');
// [
//   { section: 'home', locale: 'ko', lastUpdated: Date, contentCount: 5 },
//   { section: 'about', locale: 'en', lastUpdated: Date, contentCount: 3 }
// ]
```

### Deleting Drafts

```typescript
// Delete specific draft
await cmsDraftCacheRepository.deleteByUser('home', 'ko', 'user123');

// Cleanup old drafts (30+ days)
await cmsDraftCacheRepository.cleanupOldDrafts(30);
```

### Client-Side Draft Editing

```typescript
'use client';
import { useCmsStore } from '@spfn/cms/client';
import { useState } from 'react';

export function DraftEditor() {
  const updateLabel = useCmsStore(state => state.updateLabel);
  const { t } = useSection('home');

  const [value, setValue] = useState(t('hero.title'));

  const handleChange = (newValue: string) => {
    setValue(newValue);
    // Update client store (preview)
    updateLabel('home', 'hero.title', newValue);
  };

  const handleSave = async () => {
    // Save to server
    await saveDraft('user123', 'home', 'ko', {
      'home.hero.title': value
    });
  };

  return (
    <div>
      <input value={value} onChange={(e) => handleChange(e.target.value)} />
      <button onClick={handleSave}>Save Draft</button>
    </div>
  );
}
```

---

## Version Control

### Version System

Each label maintains version history:
- **Version 1** - Initial version
- **Version 2+** - Subsequent versions
- **Published Version** - Currently live version
- **Latest Version** - Most recent (may be draft)

### Creating Versions

```typescript
import { cmsLabelValuesRepository } from '@spfn/cms/server';

// Create new version
await cmsLabelValuesRepository.create({
  labelId: 1,
  version: 2,                    // New version number
  locale: 'ko',
  breakpoint: null,
  value: {
    type: 'text',
    content: 'Updated content'
  }
});
```

### Version History Table

Schema: `cms_label_versions`

```typescript
{
  id: number;
  labelId: number;
  version: number;
  changelog: string | null;      // Version description
  createdBy: string;             // Who created this version
  createdAt: Date;               // When created
}
```

**Example:**
```typescript
await db.insert(cmsLabelVersions).values({
  labelId: 1,
  version: 2,
  changelog: 'Updated hero title for spring campaign',
  createdBy: 'user123'
});
```

### Publishing Versions

```typescript
import { cmsLabelsRepository, cmsPublishedCacheRepository } from '@spfn/cms/server';

async function publishVersion(labelId: number, version: number) {
  // Update label's published version
  await cmsLabelsRepository.update(labelId, {
    publishedVersion: version
  });

  // Rebuild published cache
  await cmsPublishedCacheRepository.rebuildAll();
}

// Example
await publishVersion(1, 2);
```

### Rolling Back Versions

```typescript
async function rollbackVersion(labelId: number, targetVersion: number) {
  // Set published version back to older version
  await cmsLabelsRepository.update(labelId, {
    publishedVersion: targetVersion
  });

  // Rebuild cache
  await cmsPublishedCacheRepository.rebuildAll();
}

// Example: Rollback to version 1
await rollbackVersion(1, 1);
```

### Version Comparison

```typescript
async function compareVersions(labelId: number, version1: number, version2: number) {
  const values1 = await cmsLabelValuesRepository.findByLabelAndVersion(labelId, version1);
  const values2 = await cmsLabelValuesRepository.findByLabelAndVersion(labelId, version2);

  // Compare values
  return {
    version1: values1,
    version2: values2,
    changes: detectChanges(values1, values2)
  };
}
```

---

## Audit Logs

Complete change history with user attribution.

### Schema

```typescript
{
  id: number;
  labelId: number | null;        // FK (nullable)
  action: string;                // Action type
  userId: string;                // User ID
  userName: string | null;       // User display name
  changes: {                     // Before/after
    before: any;
    after: any;
  };
  metadata: {                    // Additional context
    version?: number;
    ip?: string;
    userAgent?: string;
    notes?: string;
  };
  createdAt: Date;
}
```

### Supported Actions

- `create` - Label created
- `update` - Label updated
- `publish` - Version published
- `unpublish` - Publish reverted
- `archive` - Label archived
- `delete` - Label deleted
- `rollback` - Version rolled back
- `duplicate` - Label duplicated

### Creating Audit Logs

```typescript
import { cmsAuditLogs } from '@spfn/cms/server';

// Log label creation
await db.insert(cmsAuditLogs).values({
  labelId: 1,
  action: 'create',
  userId: 'user123',
  userName: 'John Doe',
  changes: {
    before: null,
    after: {
      key: 'home.hero.title',
      section: 'home',
      type: 'text'
    }
  },
  metadata: {
    ip: '192.168.1.1',
    userAgent: 'Mozilla/5.0...'
  }
});

// Log publish action
await db.insert(cmsAuditLogs).values({
  labelId: 1,
  action: 'publish',
  userId: 'admin',
  userName: 'Admin User',
  changes: {
    before: { publishedVersion: null },
    after: { publishedVersion: 2 }
  },
  metadata: {
    version: 2,
    notes: 'Spring campaign launch'
  }
});
```

### Querying Audit Logs

```typescript
import { cmsAuditLogs } from '@spfn/cms/server';
import { eq, desc } from 'drizzle-orm';

// Get label history
const labelHistory = await db.select()
  .from(cmsAuditLogs)
  .where(eq(cmsAuditLogs.labelId, 1))
  .orderBy(desc(cmsAuditLogs.createdAt))
  .limit(20);

// Get user activity
const userActivity = await db.select()
  .from(cmsAuditLogs)
  .where(eq(cmsAuditLogs.userId, 'user123'))
  .orderBy(desc(cmsAuditLogs.createdAt));

// Get recent changes (last 24 hours)
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
const recentChanges = await db.select()
  .from(cmsAuditLogs)
  .where(gte(cmsAuditLogs.createdAt, yesterday))
  .orderBy(desc(cmsAuditLogs.createdAt));

// Get publish history
const publishHistory = await db.select()
  .from(cmsAuditLogs)
  .where(eq(cmsAuditLogs.action, 'publish'))
  .orderBy(desc(cmsAuditLogs.createdAt));
```

### Audit Log UI Example

```typescript
import { cmsAuditLogs } from '@spfn/cms/server';

export async function AuditLogTable({ labelId }: { labelId: number }) {
  const logs = await db.select()
    .from(cmsAuditLogs)
    .where(eq(cmsAuditLogs.labelId, labelId))
    .orderBy(desc(cmsAuditLogs.createdAt))
    .limit(50);

  return (
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>User</th>
          <th>Action</th>
          <th>Changes</th>
        </tr>
      </thead>
      <tbody>
        {logs.map(log => (
          <tr key={log.id}>
            <td>{log.createdAt.toLocaleString()}</td>
            <td>{log.userName || log.userId}</td>
            <td>{log.action}</td>
            <td>
              {log.changes?.before && <div>Before: {JSON.stringify(log.changes.before)}</div>}
              {log.changes?.after && <div>After: {JSON.stringify(log.changes.after)}</div>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

---

## Concurrent Editing

Multiple users can edit the same content simultaneously using draft cache.

### How It Works

1. **User A** opens editor → Loads published cache
2. **User A** makes changes → Saves to `draft_cache` (userId: A)
3. **User B** opens editor → Loads published cache
4. **User B** makes changes → Saves to `draft_cache` (userId: B)
5. **User A** publishes → Updates published cache
6. **User B** sees notification → Can review changes and merge

### Conflict Resolution

```typescript
async function detectConflicts(
  userId: string,
  section: string,
  locale: string
) {
  // Get user's draft
  const userDraft = await cmsDraftCacheRepository.findByUser(section, locale, userId);

  // Get current published
  const published = await cmsPublishedCacheRepository.findBySection(section, locale);

  // Compare timestamps
  if (userDraft && published) {
    const draftTime = new Date(userDraft.updatedAt).getTime();
    const publishedTime = new Date(published.publishedAt || 0).getTime();

    if (publishedTime > draftTime) {
      return {
        hasConflict: true,
        message: 'Content was published by another user after your draft was created'
      };
    }
  }

  return { hasConflict: false };
}
```

### Merge Strategy

```typescript
async function mergeDrafts(
  section: string,
  locale: string,
  userId: string
) {
  const userDraft = await cmsDraftCacheRepository.findByUser(section, locale, userId);
  const published = await cmsPublishedCacheRepository.findBySection(section, locale);

  // Simple merge: user draft overrides published
  const merged = {
    ...published?.content,
    ...userDraft?.content
  };

  return merged;
}
```

---

## Workflows

### Content Creation Workflow

```
1. Create Label
   ↓
2. Create Version 1
   ↓
3. Save Draft (optional)
   ↓
4. Review & Approve
   ↓
5. Publish Version 1
   ↓
6. Update Published Cache
   ↓
7. Log Audit Entry
```

### Content Update Workflow

```
1. Load Published Version
   ↓
2. Create New Version (n+1)
   ↓
3. Save Changes to Draft
   ↓
4. Preview Draft
   ↓
5. Publish New Version
   ↓
6. Update Published Cache
   ↓
7. Archive Old Draft
   ↓
8. Log Audit Entry
```

### Rollback Workflow

```
1. Identify Target Version
   ↓
2. Update publishedVersion
   ↓
3. Rebuild Published Cache
   ↓
4. Log Rollback Action
   ↓
5. Notify Stakeholders
```

---

## Best Practices

### 1. Regular Cleanups

```typescript
// Cron job: Daily cleanup
async function dailyCleanup() {
  // Remove drafts older than 30 days
  await cmsDraftCacheRepository.cleanupOldDrafts(30);

  // Archive old audit logs (optional)
  // await archiveOldAuditLogs(90);
}
```

### 2. Version Naming

Use semantic versioning or descriptive names:

```typescript
await db.insert(cmsLabelVersions).values({
  labelId: 1,
  version: 2,
  changelog: 'v2.0 - Spring 2025 Campaign Launch',
  createdBy: 'marketing-team'
});
```

### 3. Audit Log Enrichment

Include context in metadata:

```typescript
metadata: {
  version: 2,
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  notes: 'Updated for A/B test',
  campaign: 'spring-2025',
  approvedBy: 'manager-id'
}
```

### 4. Draft Expiration Warning

Warn users about draft expiration:

```typescript
async function getDraftAge(userId: string, section: string, locale: string) {
  const draft = await cmsDraftCacheRepository.findByUser(section, locale, userId);

  if (!draft) return null;

  const ageInDays = Math.floor(
    (Date.now() - new Date(draft.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    ageInDays,
    willExpireSoon: ageInDays > 25 // Warn 5 days before cleanup
  };
}
```

---

## Next Steps

- **[Advanced Features](./ADVANCED_FEATURES.md)** - Breakpoints, value types, InitCms
- **[Locale Management](./LOCALE_GUIDE.md)** - Complete locale guide
- **[API Reference](./API_REFERENCE.md)** - Complete API documentation