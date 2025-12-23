# @spfn/workflow

Lightweight workflow engine - Pipeline orchestration based on `@spfn/core` Jobs

## Overview

`@spfn/workflow` is a workflow engine that defines and executes complex business processes by chaining multiple Jobs together.

```
┌─────────┐    data   ┌─────────┐    data   ┌─────────┐
│  Job A  │ ────────▶ │  Job B  │ ────────▶ │  Job C  │
└─────────┘           └─────────┘           └─────────┘
     │                     │                     │
     └─────────────────────┴─────────────────────┘
                    Workflow
```

## Installation

```bash
pnpm add @spfn/workflow
```

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Job** | Independent unit of work (defined in `@spfn/core`) |
| **Workflow** | Pipeline that chains Jobs together |
| **Step** | Individual execution unit within a Workflow |
| **Engine** | Workflow execution and state management |

## Quick Start

### 1. Define Jobs (@spfn/core)

```typescript
import { job } from '@spfn/core/job';
import { Type } from '@sinclair/typebox';

const createRepo = job('create-repo')
    .input(Type.Object({
        tenantId: Type.String(),
    }))
    .output(Type.Object({
        repoId: Type.String(),
        repoUrl: Type.String(),
    }))
    .compensate(async (input, output) => {
        // Compensation logic executed during rollback
        await gitea.deleteRepo(output.repoId);
    })
    .handler(async (input) => {
        const repo = await gitea.create(input.tenantId);
        return { repoId: repo.id, repoUrl: repo.url };
    });
```

### 2. Define Workflow

```typescript
import { workflow } from '@spfn/workflow';

export const provisionTenant = workflow('provision-tenant')
    .input(Type.Object({
        tenantId: Type.String(),
        plan: Type.String(),
    }))
    .resumable(true)      // Resume from failure point
    .rollback(true)       // Enable rollback on failure

    // Sequential execution
    .pipe(createPodIdentity, (ctx) => ({
        tenantId: ctx.input.tenantId,
        plan: ctx.input.plan,
    }))

    // Parallel execution
    .parallel({
        appRepo: [createAppRepo, (ctx) => ({
            tenantId: ctx.input.tenantId,
        })],
        gitopsRepo: [createGitopsRepo, (ctx) => ({
            tenantId: ctx.input.tenantId,
        })],
    })

    // Reference previous results (type-inferred)
    .pipe(notifyComplete, (ctx) => ({
        tenantId: ctx.input.tenantId,
        appRepoUrl: ctx.results.appRepo.repoUrl,
        gitopsRepoUrl: ctx.results.gitopsRepo.repoUrl,
    }))

    .build();
```

### 3. Configure Engine

```typescript
// workflow.config.ts
import { defineWorkflows } from '@spfn/workflow';
import { database } from './db';

export default defineWorkflows({
    workflows: [provisionTenant, deprovisionTenant],
    db: database,
    storage: s3Storage,  // For large outputs (optional)
});
```

### 4. Execute Workflow

```typescript
import { getWorkflowEngine } from '@spfn/workflow';
import type { default as WorkflowConfig } from './workflow.config';

const engine = getWorkflowEngine<typeof WorkflowConfig>();

// Execute (async)
const execution = await engine.start('provision-tenant', {
    tenantId: 'abc',
    plan: 'pro',
});

// Check status
const status = await engine.get(execution.id);

// Get step output
const output = await engine.getStepOutput(execution.id, 'appRepo');
```

## API Reference

### Workflow Builder

#### `workflow(name)`

Creates a new workflow builder.

```typescript
const wf = workflow('my-workflow');
```

#### `.input(schema)`

Defines the input schema (TypeBox).

```typescript
.input(Type.Object({
    tenantId: Type.String(),
    plan: Type.Union([Type.Literal('free'), Type.Literal('pro')]),
}))
```

#### `.pipe(job, mapper)`

Adds a sequential execution step.

```typescript
.pipe(createRepo, (ctx) => ({
    tenantId: ctx.input.tenantId,
}))
```

#### `.parallel(steps)`

Adds parallel execution steps.

```typescript
.parallel({
    appRepo: [createAppRepo, (ctx) => ({ tenantId: ctx.input.tenantId })],
    gitopsRepo: [createGitopsRepo, (ctx) => ({ tenantId: ctx.input.tenantId })],
})
```

#### `.resumable(enabled)`

Sets whether the workflow can resume from failure point.

- `true`: Skip completed steps and restart from failure point
- `false` (default): Restart from beginning

#### `.rollback(enabled)`

Sets whether rollback is enabled on failure.

- `true` (default): Execute `compensate` functions of completed steps in reverse order
- `false`: No rollback

#### `.notify(config)`

Adds notification configuration.

```typescript
.notify({
    on: ['failed', 'completed'],
    when: (event) => event.input.plan === 'pro',  // Conditional (optional)
    providers: [consoleProvider, slackProvider],
})
```

#### `.build()`

Completes the workflow definition.

---

### Workflow Engine

#### `createWorkflowEngine(options)`

Creates a workflow engine.

```typescript
const engine = createWorkflowEngine({
    workflows: [provisionTenant],
    db: database,
    storage: s3Storage,  // Optional
    largeOutputThreshold: 1024 * 1024,  // 1MB (optional)
});
```

#### `engine.start(name, input)`

Executes a workflow asynchronously.

```typescript
const execution = await engine.start('provision-tenant', {
    tenantId: 'abc',
    plan: 'pro',
});
// { id: 'exec-123', workflowName: 'provision-tenant', status: 'pending' }
```

#### `engine.get(executionId)`

Gets execution status.

```typescript
const status = await engine.get('exec-123');
// { id, workflowName, status, input, steps: [...], createdAt, ... }
```

#### `engine.getStepOutput(executionId, stepName)`

Gets the output of a specific step.

```typescript
const output = await engine.getStepOutput('exec-123', 'appRepo');
// { repoId: 'repo-abc', repoUrl: 'https://...' }
```

#### `engine.list(options?)`

Lists executions.

```typescript
const list = await engine.list({
    workflowName: 'provision-tenant',
    status: 'failed',
    limit: 10,
    offset: 0,
});
```

#### `engine.retry(executionId)`

Retries a failed workflow.

- `resumable: true`: Resume from failure point
- `resumable: false`: Restart from beginning

```typescript
await engine.retry('exec-123');
```

#### `engine.cancel(executionId, options?)`

Cancels a running workflow.

```typescript
await engine.cancel('exec-123');
await engine.cancel('exec-123', { rollback: true });  // With rollback
```

#### `engine.subscribe(executionId, callback)`

Subscribes to execution events.

```typescript
const unsubscribe = engine.subscribe('exec-123', (event) => {
    console.log(event.type, event.stepName);
});

// Unsubscribe
unsubscribe();
```

---

### Notification Providers

Only `consoleProvider` is provided by default. For email, SMS, Slack, etc., implement your own provider using `@spfn/notification`.

#### `consoleProvider`

Logs events to console (built-in).

```typescript
import { consoleProvider } from '@spfn/workflow';

.notify({
    on: ['failed'],
    providers: [consoleProvider],
})
```

#### `formatEventAsText(event)`

Helper function to format workflow events as plain text. Useful when implementing custom providers.

```typescript
import { formatEventAsText } from '@spfn/workflow';

const text = formatEventAsText(event);
// Output:
// Workflow: provision-tenant
// Event: failed
// Execution ID: exec-123
// Timestamp: 2024-01-01T00:00:00.000Z
// Error: Connection timeout
```

### Custom Providers with @spfn/notification

Implement custom notification providers using `@spfn/notification` for email, SMS, Slack, etc.

#### Email Provider

```typescript
import { formatEventAsText } from '@spfn/workflow';
import { sendEmail } from '@spfn/notification/server';
import type { NotificationProvider } from '@spfn/workflow';

const emailProvider: NotificationProvider = {
    name: 'email',
    async notify(event)
    {
        await sendEmail({
            to: 'admin@example.com',
            subject: `[Workflow] ${event.workflowName}: ${event.type}`,
            text: formatEventAsText(event),
        });
    },
};

// Use in workflow
workflow('provision-tenant')
    .pipe(...)
    .notify({
        on: ['failed', 'completed'],
        providers: [emailProvider],
    })
    .build();
```

#### SMS Provider

```typescript
import { sendSMS } from '@spfn/notification/server';
import type { NotificationProvider } from '@spfn/workflow';

const smsProvider: NotificationProvider = {
    name: 'sms',
    async notify(event)
    {
        const message = `[${event.workflowName}] ${event.type}` +
            (event.error ? `: ${event.error}` : '');

        await sendSMS({
            to: '+821012345678',
            message,
        });
    },
};
```

#### Slack Provider

```typescript
import type { NotificationProvider } from '@spfn/workflow';

const slackProvider: NotificationProvider = {
    name: 'slack',
    async notify(event)
    {
        await fetch(process.env.SLACK_WEBHOOK_URL!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: `[${event.workflowName}] ${event.type}`,
                attachments: [{
                    color: event.type === 'failed' ? 'danger' : 'good',
                    fields: [
                        { title: 'Execution ID', value: event.executionId, short: true },
                        { title: 'Event', value: event.type, short: true },
                    ],
                }],
            }),
        });
    },
};
```

#### Combined Notifications

```typescript
import { consoleProvider } from '@spfn/workflow';

workflow('provision-tenant')
    .pipe(...)
    .notify({
        on: ['started', 'completed', 'failed'],
        providers: [consoleProvider],
    })
    .notify({
        on: ['failed'],
        providers: [emailProvider, slackProvider, smsProvider],
    })
    .build();
```

---

## Events

Events emitted during workflow execution:

| Event | Description |
|-------|-------------|
| `started` | Workflow execution started |
| `step.started` | Step execution started |
| `step.completed` | Step execution completed |
| `step.failed` | Step execution failed |
| `completed` | Entire workflow completed |
| `failed` | Workflow failed |
| `cancelled` | Workflow cancelled |

```typescript
interface WorkflowEvent {
    type: 'started' | 'step.started' | 'step.completed' | ...;
    workflowName: string;
    executionId: string;
    stepName?: string;
    stepIndex?: number;
    input?: unknown;
    output?: unknown;
    error?: string;
    timestamp: Date;
}
```

---

## Status Flow

### Workflow Status

```
pending → running → completed
                  → failed → compensating → compensated
                  → cancelled
```

| Status | Description |
|--------|-------------|
| `pending` | Waiting for execution |
| `running` | Currently executing |
| `completed` | Successfully completed |
| `failed` | Failed |
| `compensating` | Rollback in progress |
| `compensated` | Rollback completed |
| `cancelled` | Cancelled |

### Step Status

| Status | Description |
|--------|-------------|
| `pending` | Waiting for execution |
| `running` | Currently executing |
| `completed` | Completed |
| `failed` | Failed |
| `skipped` | Skipped |
| `compensated` | Compensation completed |

---

## Rollback Strategy

```
Execution: Step1 ✓ → Step2 ✓ → Step3 ✗

Rollback: Step2.compensate() → Step1.compensate()
          (Step3 doesn't need compensation as it failed)
          (Continue even if compensation fails)
```

- Rollback only executes for Jobs with `compensate` function defined
- Continues with other compensations even if one fails
- Executes in reverse order (from last completed step)

---

## Database Entities

All tables are created in the `spfn_workflow` schema.

### spfn_workflow.executions

```typescript
{
    id: string;
    workflowName: string;
    status: WorkflowStatus;
    input: unknown;       // jsonb
    currentStep: number;
    error?: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
}
```

### spfn_workflow.step_executions

```typescript
{
    id: string;
    executionId: string;  // FK
    stepName: string;
    stepIndex: number;
    status: WorkflowStepStatus;
    output?: unknown;     // jsonb or { $ref: url }
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
}
```

---

## Large Output Handling

When step output exceeds threshold (default 1MB), it's stored in external storage.

```typescript
// Storage interface
interface OutputStorage {
    upload(data: unknown): Promise<string>;  // Returns URL
    download(url: string): Promise<unknown>;
}

// Engine configuration
const engine = createWorkflowEngine({
    workflows: [...],
    db: database,
    storage: {
        async upload(data) {
            const key = `outputs/${crypto.randomUUID()}.json`;
            await s3.putObject({ Key: key, Body: JSON.stringify(data) });
            return `s3://${bucket}/${key}`;
        },
        async download(url) {
            const key = url.replace(`s3://${bucket}/`, '');
            const { Body } = await s3.getObject({ Key: key });
            return JSON.parse(await Body.transformToString());
        },
    },
    largeOutputThreshold: 1024 * 1024,  // 1MB
});
```

---

## Project Structure

```
src/
├── index.ts                    # Public exports
├── builder/                    # Workflow definition API
│   ├── workflow-builder.ts     # Builder implementation
│   └── types.ts                # Type definitions
├── engine/                     # Execution engine
│   ├── workflow-engine.ts      # Engine implementation
│   └── types.ts                # Type definitions
├── entities/                   # DB entities
│   ├── workflow-execution.entity.ts
│   └── workflow-step-execution.entity.ts
├── notification/               # Notification system
│   ├── providers.ts            # Built-in providers
│   └── types.ts                # Type definitions
├── config/                     # Configuration utilities
│   └── define-workflows.ts     # defineWorkflows, getWorkflowEngine
└── types/                      # Common types
    └── status.ts               # Status types
```

---

## Design Principles

| Principle | Description |
|-----------|-------------|
| **Step Independence** | Steps (Jobs) are unaware of other steps |
| **Step Reusability** | A single step can participate in multiple workflows |
| **Composition** | New workflows = combination of existing steps |
| **Explicit Mapping** | Data transfer between steps is explicitly defined |
| **Type Safety** | Only registered workflows can be executed, input/output types are inferred |

---

## License

MIT
