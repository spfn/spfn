# @spfn/monitor

Error tracking, log management, and monitoring dashboard for SPFN applications.

## Features

- **DB-backed error tracking**: Fingerprint-based deduplication with automatic grouping
- **State-based notifications**: Slack alerts only on new errors and reopened errors (no duplicates)
- **Developer logging**: Pluggable log storage with DB default
- **Admin API**: Superadmin-only routes for managing errors and viewing logs
- **React dashboard**: Ready-to-use monitoring UI components

## Installation

```bash
pnpm add @spfn/monitor
```

## Quick Start

### Server Configuration

```typescript
import { defineServerConfig } from '@spfn/core/server';
import { createMonitorErrorHandler, createMonitorLifecycle, monitorRouter } from '@spfn/monitor/server';

export default defineServerConfig()
    .middleware({ onError: createMonitorErrorHandler() })
    .routes(appRouter)
    .lifecycle(createMonitorLifecycle())
    .build();
```

Register the monitor router as a package router:

```typescript
import { monitorRouter } from '@spfn/monitor/server';

export const appRouter = defineRouter({ ... })
    .packages([authRouter, monitorRouter]);
```

### Database Migration

```bash
spfn db migrate
```

This creates the `spfn_monitor` schema with `error_groups`, `error_events`, and `logs` tables.

## Configuration

### Environment Variables

```bash
# Slack webhook for error notifications (optional)
SPFN_MONITOR_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Error retention in days (default: 90)
SPFN_MONITOR_ERROR_RETENTION_DAYS=90

# Log retention in days (default: 30)
SPFN_MONITOR_LOG_RETENTION_DAYS=30

# Minimum HTTP status code to track (default: 500)
SPFN_MONITOR_MIN_STATUS_CODE=500
```

### Code Configuration

```typescript
import { configureMonitor } from '@spfn/monitor/config';

configureMonitor({
    slackWebhookUrl: 'https://hooks.slack.com/services/...',
    errorRetentionDays: 90,
    logRetentionDays: 30,
    minStatusCode: 500,
});
```

## Error Tracking

Errors are automatically tracked when using `createMonitorErrorHandler()`:

1. **New error** - Creates error group + event, sends Slack notification
2. **Repeated error** (active/ignored) - Increments count, records event, no notification
3. **Reopened error** (was resolved) - Changes status to active, sends Slack notification

### Fingerprinting

Errors are grouped by a SHA-256 fingerprint of `name:message:path`, producing a 16-character hex ID.

### Manual Error Tracking

```typescript
import { trackError } from '@spfn/monitor/server';

await trackError(error, {
    statusCode: 500,
    path: '/api/example',
    method: 'POST',
    requestId: 'req_123',
});
```

## Developer Logging

```typescript
import { writeLog, queryLogs } from '@spfn/monitor/server';

// Write a log entry
await writeLog({
    level: 'info',
    message: 'User signed in',
    source: 'auth',
    userId: 'user_123',
    metadata: { provider: 'google' },
});

// Query logs
const logs = await queryLogs({
    level: 'error',
    source: 'payment',
    limit: 50,
});
```

### Custom Log Store

Replace the default DB storage with a custom implementation:

```typescript
import { setLogStore } from '@spfn/monitor/server';

setLogStore({
    async write(entry) { /* S3, ClickHouse, etc. */ },
    async query(filters) { /* ... */ },
    async purge(olderThan) { /* ... */ },
});
```

## Admin API Routes

All routes require `superadmin` role authentication.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/_monitor/admin/errors` | List error groups (filter by status, path, search) |
| GET | `/_monitor/admin/errors/:id` | Error group detail + recent events |
| PATCH | `/_monitor/admin/errors/:id` | Update error status (resolve/ignore/reopen) |
| GET | `/_monitor/admin/errors/:id/events` | List events for an error group |
| GET | `/_monitor/admin/logs` | Query logs (filter by level, source, search) |
| GET | `/_monitor/admin/stats` | Dashboard statistics |

## Dashboard Components

```typescript
// In your Next.js page
import { MonitorDashboard } from '@spfn/monitor/nextjs/client';

export default function MonitorPage() {
    return <MonitorDashboard />;
}
```

Available components:

- `MonitorDashboard` - Full dashboard with tabs (errors, logs) and stats
- `StatsOverview` - Error/log count cards with trends
- `ErrorListView` - Filterable error group table
- `ErrorDetailView` - Error detail with event timeline and status actions
- `LogViewer` - Searchable log list with expandable metadata

## API Client

```typescript
import { monitorApi } from '@spfn/monitor';

// Get dashboard stats
const stats = await monitorApi.getStats.call({});

// List active errors
const errors = await monitorApi.listErrors.call({
    query: { status: 'active', limit: 20 },
});

// Resolve an error
await monitorApi.updateErrorStatus.call({
    params: { id: 1 },
    body: { status: 'resolved' },
});
```

## Exports

```typescript
// From '@spfn/monitor'
export { monitorApi };
export type { MonitorRouter, MonitorStats, ErrorGroupStatus, LogLevel };

// From '@spfn/monitor/server'
export {
    // Integration
    monitorRouter,
    createMonitorErrorHandler,
    createMonitorLifecycle,

    // Services
    trackError, updateErrorGroupStatus,
    writeLog, queryLogs,
    getMonitorStats,
    setLogStore,

    // Entities & Repositories
    errorGroups, errorEvents, logs,
    errorGroupsRepository, errorEventsRepository, logsRepository,
};

// From '@spfn/monitor/config'
export { configureMonitor };

// From '@spfn/monitor/nextjs/client'
export {
    MonitorDashboard, StatsOverview,
    ErrorListView, ErrorDetailView, LogViewer,
};
```

## License

MIT
