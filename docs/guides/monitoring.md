---
title: "Monitoring"
description: "Error tracking, log management, and monitoring dashboard with @spfn/monitor"
order: 11
available: true
---

# Monitoring

`@spfn/monitor` provides DB-backed error tracking, developer log storage, and an admin dashboard for SPFN applications.

## Features

- **Error Tracking** — Automatic fingerprint-based deduplication, status management (active/resolved/ignored)
- **State-Based Notifications** — Slack alerts only on new or reopened errors (no in-memory throttling)
- **Developer Logging** — Write and query structured logs via DB with pluggable storage backends
- **Admin Dashboard** — React components for error list, detail view, log viewer, and statistics
- **Admin API** — RESTful routes for error/log management (superadmin only)

## Installation

```bash
pnpm add @spfn/monitor
```

Run migrations:

```bash
pnpm spfn db push
```

## Server Configuration

```typescript
// src/server/server.config.ts
import { defineServerConfig } from '@spfn/core/server';
import { mergeRouters } from '@spfn/core/route';
import {
    createMonitorErrorHandler,
    createMonitorLifecycle,
    monitorRouter,
} from '@spfn/monitor/server';
import { appRouter } from './router';

export default defineServerConfig()
    .middleware({
        onError: createMonitorErrorHandler(),
    })
    .routes(mergeRouters(appRouter, monitorRouter))
    .lifecycle(createMonitorLifecycle())
    .build();
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SPFN_MONITOR_SLACK_WEBHOOK_URL` | — | Slack webhook URL for error notifications |
| `SPFN_MONITOR_ERROR_RETENTION_DAYS` | `90` | Days to retain error events |
| `SPFN_MONITOR_LOG_RETENTION_DAYS` | `30` | Days to retain logs |
| `SPFN_MONITOR_MIN_STATUS_CODE` | `500` | Minimum HTTP status code to track |

## Error Tracking

### How It Works

1. An error occurs in a route handler
2. `createMonitorErrorHandler()` generates a fingerprint (`SHA-256(name:message:path)`)
3. Checks if an error group with this fingerprint exists:
   - **New error** — Creates group + event, sends Slack notification
   - **Active/Ignored** — Increments count + creates event (no notification)
   - **Resolved** — Reopens to active, increments count + creates event, sends Slack notification

### Error Handler Options

```typescript
createMonitorErrorHandler({
    // Only track 5xx errors (default: 500)
    minStatusCode: 500,

    // Attach custom metadata to each error event
    extractMetadata: (err, ctx) => ({
        env: process.env.NODE_ENV,
        serverInstance: process.env.HOSTNAME,
    }),
});
```

### Manual Error Tracking

```typescript
import { trackError } from '@spfn/monitor/server';

try
{
    await riskyOperation();
}
catch (error)
{
    await trackError(error as Error, {
        statusCode: 500,
        path: '/internal/operation',
        method: 'POST',
    });
}
```

### Status Management

```typescript
import { updateErrorGroupStatus } from '@spfn/monitor/server';

// Resolve an error group
await updateErrorGroupStatus(groupId, 'resolved');

// Ignore an error group
await updateErrorGroupStatus(groupId, 'ignored');

// Reopen an error group
await updateErrorGroupStatus(groupId, 'active');
```

## Developer Logging

### Writing Logs

```typescript
import { writeLog, monitor } from '@spfn/monitor/server';

// Full API
await writeLog({
    level: 'info',
    message: 'User signed up',
    source: 'auth',
    userId: '123',
    metadata: { method: 'email' },
});

// Convenience shorthand
await monitor.log({
    level: 'warn',
    message: 'Rate limit approaching',
    source: 'api-gateway',
});
```

### Querying Logs

```typescript
import { queryLogs } from '@spfn/monitor/server';

const logs = await queryLogs({
    level: 'error',
    source: 'payment',
    search: 'timeout',
    dateFrom: new Date('2024-01-01'),
    limit: 50,
});
```

### Custom Log Store

Replace the default DB store with a custom backend:

```typescript
import { setLogStore, type LogStore } from '@spfn/monitor/server';

class S3LogStore implements LogStore
{
    async write(entry) { /* ... */ }
    async query(filters) { /* ... */ }
    async purge(olderThan) { /* ... */ }
}

setLogStore(new S3LogStore());
```

## Admin API

All routes require `superadmin` role.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/_monitor/admin/errors` | List error groups (filter: status, path, search, dateRange) |
| GET | `/_monitor/admin/errors/:id` | Error group detail + recent 20 events |
| PATCH | `/_monitor/admin/errors/:id` | Update status (resolve/ignore/reopen) |
| GET | `/_monitor/admin/errors/:id/events` | Error events with pagination |
| GET | `/_monitor/admin/logs` | Query logs (filter: level, source, search, dateRange) |
| GET | `/_monitor/admin/stats` | Dashboard statistics |

### API Client Usage

```typescript
import { monitorApi } from '@spfn/monitor';

// Get stats
const stats = await monitorApi.getStats.call({});

// List active errors
const errors = await monitorApi.listErrors.call({
    query: { status: 'active', limit: 20 },
});

// Resolve an error
await monitorApi.updateErrorStatus.call({
    params: { id: 42 },
    body: { status: 'resolved' },
});
```

## Dashboard Components

### Full Dashboard

```tsx
// app/admin/monitor/page.tsx
import { MonitorDashboard } from '@spfn/monitor/nextjs/client';

export default function MonitorPage()
{
    return <MonitorDashboard />;
}
```

### Individual Components

```tsx
import {
    StatsOverview,
    ErrorListView,
    ErrorDetailView,
    LogViewer,
} from '@spfn/monitor/nextjs/client';

// Stats cards
<StatsOverview />

// Error list with filters
<ErrorListView onSelect={(id) => router.push(`/admin/monitor/errors/${id}`)} />

// Error detail with event timeline
<ErrorDetailView errorId={42} onBack={() => router.back()} />

// Searchable log viewer
<LogViewer />
```

All components use Tailwind CSS with dark mode support.

## Migration from `createErrorSlackNotifier`

If you're using `createErrorSlackNotifier` from `@spfn/notification`, switch to `createMonitorErrorHandler`:

```typescript
// Before
import { createErrorSlackNotifier } from '@spfn/notification/server';
middleware: { onError: createErrorSlackNotifier({ minStatusCode: 500 }) }

// After
import { createMonitorErrorHandler } from '@spfn/monitor/server';
middleware: { onError: createMonitorErrorHandler({ minStatusCode: 500 }) }
```

Key differences:
- Errors are persisted in DB (survives server restarts)
- Notifications based on state transitions, not time-based throttling
- Admin dashboard for viewing and managing errors
- Developer logging API included

## Statistics

The `getMonitorStats()` function returns:

```typescript
interface MonitorStats
{
    errors: {
        total: number;
        active: number;
        resolved: number;
        ignored: number;
    };
    recentErrors: ErrorGroup[];   // Latest 10 active errors
    logs: {
        total: number;
        byLevel: Record<LogLevel, number>;
    };
    trends: {
        errorsLast24h: number;
        errorsLast7d: number;
        logsLast24h: number;
    };
}
```
