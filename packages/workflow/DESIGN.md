# @spfn/workflow Design Document

Lightweight workflow engine - Based on `@spfn/core` Job/Events

## Core Concepts

```
Job = Independent unit of work (existing @spfn/core)
Workflow = Pipeline that chains Jobs together
```

```
┌─────────┐    data    ┌─────────┐    data    ┌─────────┐
│  Job A  │ ────────▶ │  Job B  │ ────────▶ │  Job C  │
└─────────┘           └─────────┘           └─────────┘
     │                     │                     │
     └─────────────────────┴─────────────────────┘
                    Workflow
```

## Design Principles

| Principle | Description |
|-----------|-------------|
| Step Independence | Steps (Jobs) are unaware of other steps |
| Step Reusability | A single step can participate in multiple workflows |
| Composition | New workflow = combination of existing steps |
| Explicit Mapping | Data transfer between steps is explicitly defined |
| Type Safety | Only registered workflows can be executed, input types are inferred |

---

## API Design

### 1. Job Extensions (@spfn/core)

```typescript
const createRepo = job('create-repo')
    .input(Type.Object({
        tenantId: Type.String()
    }))
    .output(Type.Object({
        repoId: Type.String(),
        repoUrl: Type.String(),
    }))
    .retry({
        attempts: 3,
        delay: 1000,
        backoff: 'exponential',
    })
    .timeout(30000)
    .compensate(async (input, output) => {
        await gitea.deleteRepo(output.repoId);
    })
    .handler(async (input) => {
        const repo = await gitea.create(input.tenantId);
        return { repoId: repo.id, repoUrl: repo.url };
    });
```

### 2. Workflow Definition

```typescript
import { workflow } from '@spfn/workflow';

export const provisionTenant = workflow('provision-tenant')
    .input(Type.Object({
        tenantId: Type.String(),
        plan: PlanType,
    }))
    .resumable(true)      // Resume from failure point
    .rollback(true)       // Rollback in reverse order on failure (default: true)
    .notify({
        on: ['failed'],
        when: (event) => event.input.plan === 'pro',
        providers: [slackProvider],
    })
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
    // Reference previous results
    .pipe(notifyComplete, (ctx) => ({
        tenantId: ctx.input.tenantId,
        appRepoUrl: ctx.results.appRepo.repoUrl,
        gitopsRepoUrl: ctx.results.gitopsRepo.repoUrl,
    }))
    .build();
```

### 3. Configuration Registration

```typescript
import { defineWorkflows } from '@spfn/workflow';
import { provisionTenant, deprovisionTenant } from './workflows';

export default defineWorkflows({
    workflows: [provisionTenant, deprovisionTenant],
    db: database,
});
```

### 4. Workflow Execution and Control

```typescript
import { getWorkflowEngine } from '@spfn/workflow';
import type { default as WorkflowConfig } from './workflow.config';

const workflowEngine = getWorkflowEngine<typeof WorkflowConfig>();

// Execute (async)
const execution = await workflowEngine.start('provision-tenant', {
    tenantId: 'abc',
    plan: 'pro',
});

// Get status
const status = await workflowEngine.get(execution.id);

// Get step output
const output = await workflowEngine.getStepOutput(execution.id, 'appRepo');

// List executions
const list = await workflowEngine.list({
    workflowName: 'provision-tenant',
    status: 'failed',
});

// Retry
await workflowEngine.retry(execution.id);

// Cancel
await workflowEngine.cancel(execution.id);
await workflowEngine.cancel(execution.id, { rollback: true });

// Subscribe to events
workflowEngine.subscribe(execution.id, (event) => {
    console.log(event.type, event.data);
});
```

---

## Execution Model

### Async + Event Trigger

Each step runs as a separate Job, connected via events:

```
workflow.start(input)
    │
    ▼
┌─────────────────────────────────────────────┐
│ emit: workflow.provision.started            │
│ → Job: step1 triggered                      │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ Step1 completed                             │
│ emit: workflow.provision.step1.completed    │
│ → Job: step2 triggered                      │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ Step2 completed                             │
│ emit: workflow.provision.step2.completed    │
│ → Job: step3 triggered                      │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│ All steps completed                         │
│ emit: workflow.provision.completed          │
└─────────────────────────────────────────────┘
```

---

## Failure Handling Strategy

| Item | Decision |
|------|----------|
| Retry | Defined at Job level |
| Compensation definition | Defined at Job level (optional) |
| Rollback execution | Automatic reverse order in Workflow |
| On compensation failure | Ignore and continue |
| Jobs without compensation | Allowed (skip) |
| Parallel failure | Entire workflow fails |
| Disable rollback | Option supported |

### Rollback Flow

```
Execution: Step1 ✓ → Step2 ✓ → Step3 ✗

Rollback: Step2.compensate() → Step1.compensate()
          (Step3 doesn't need compensation as it failed)
          (Continue even if compensation fails)
```

### Retry Strategy

```typescript
// When resumable: true
Step1 ✓ → Step2 ✓ → Step3 ✗

retry(id):
  - Load Step1, Step2 outputs from DB
  - Resume from Step3

// When resumable: false
  - Restart from beginning
```

---

## State Persistence

### Table Structure

```typescript
// workflow_executions
interface WorkflowExecution {
    id: string;
    workflowName: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'compensating' | 'compensated' | 'cancelled';
    input: unknown;           // jsonb
    currentStep: number;
    createdAt: Date;
    updatedAt: Date;
    completedAt?: Date;
}

// workflow_step_executions
interface WorkflowStepExecution {
    id: string;
    executionId: string;      // FK
    stepName: string;
    stepIndex: number;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'compensated';
    output?: unknown;         // jsonb or URL (large data)
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
}
```

### Large Output Handling

```typescript
if (sizeof(output) > THRESHOLD) {
    const url = await storage.upload(output);
    stepExecution.output = { $ref: url };
} else {
    stepExecution.output = output;
}
```

---

## Monitoring

### Event Structure

```typescript
workflow.started        // { workflowName, executionId, input }
workflow.step.started   // { workflowName, executionId, stepName, stepIndex }
workflow.step.completed // { workflowName, executionId, stepName, stepIndex }
workflow.step.failed    // { workflowName, executionId, stepName, error }
workflow.completed      // { workflowName, executionId }
workflow.failed         // { workflowName, executionId, error }
workflow.cancelled      // { workflowName, executionId }
```

### Notification Providers

```typescript
interface NotificationProvider {
    name: string;
    notify(event: WorkflowEvent): Promise<void>;
}

// Built-in providers
const consoleProvider: NotificationProvider;
const emailProvider: (config: EmailConfig) => NotificationProvider;
const slackProvider: (config: SlackConfig) => NotificationProvider;

// Configure in workflow
workflow('provision')
    .notify({
        on: ['failed', 'completed'],
        when: (event) => event.input.plan === 'pro',
        providers: [consoleProvider, slackProvider(config)],
    });
```

---

## Implementation Phases

### Phase 1: Core Extensions (@spfn/core)

| Order | Item | Description |
|-------|------|-------------|
| 1-1 | Job output schema | Add `.output()` method |
| 1-2 | Job compensate | Add `.compensate()` method |
| 1-3 | Job timeout | Add `.timeout()` method |

### Phase 2: Package Creation (@spfn/workflow)

| Order | Item | Description |
|-------|------|-------------|
| 2-1 | Package initialization | Basic structure, dependencies |
| 2-2 | DB entities | WorkflowExecution, WorkflowStepExecution |
| 2-3 | Migrations | Table creation scripts |

### Phase 3: Workflow Definition API

| Order | Item | Description |
|-------|------|-------------|
| 3-1 | workflow() builder | Basic chaining API |
| 3-2 | .pipe() | Sequential execution definition |
| 3-3 | .parallel() | Parallel execution definition |
| 3-4 | Options | .resumable(), .rollback() |
| 3-5 | Type inference | input/output type safety |

### Phase 4: Workflow Engine (Core)

| Order | Item | Description |
|-------|------|-------------|
| 4-1 | createWorkflowEngine | Engine creation |
| 4-2 | .start() | Workflow execution (async) |
| 4-3 | Event chaining | Step-to-step event triggers |
| 4-4 | State persistence | Save each step result to DB |
| 4-5 | .get() | Status query |
| 4-6 | .getStepOutput() | Step result query |

### Phase 5: Control Features

| Order | Item | Description |
|-------|------|-------------|
| 5-1 | .retry() | Retry (considering resumable) |
| 5-2 | .cancel() | Cancel + rollback option |
| 5-3 | Rollback execution | Reverse order compensate calls |

### Phase 6: Monitoring

| Order | Item | Description |
|-------|------|-------------|
| 6-1 | Event emission | workflow.* events |
| 6-2 | .subscribe() | Real-time subscription |
| 6-3 | .list() | History query |

### Phase 7: Notifications

| Order | Item | Description |
|-------|------|-------------|
| 7-1 | Provider interface | NotificationProvider |
| 7-2 | Built-in providers | console, email, slack |
| 7-3 | .notify() | Configure notifications in workflow |
| 7-4 | Conditional notifications | when option |

### Phase 8: Integration

| Order | Item | Description |
|-------|------|-------------|
| 8-1 | defineWorkflows | Configuration helper |
| 8-2 | getWorkflowEngine | Type-safe access |
| 8-3 | Large output | Storage integration |

---

## MVP Scope

Basic operation possible after completing Phases 1-4:

```typescript
// Definition
const provision = workflow('provision')
    .input(schema)
    .pipe(step1, mapper)
    .pipe(step2, mapper);

// Execution
const exec = await engine.start('provision', input);

// Query
const status = await engine.get(exec.id);
```

---

## Implementation Status

| Phase | Status |
|-------|--------|
| Phase 1: Core Extensions | ✅ Completed |
| Phase 2: Package Creation | ✅ Completed |
| Phase 3: Workflow Definition API | ✅ Completed |
| Phase 4: Workflow Engine | ✅ Completed |
| Phase 5: Control Features | ✅ Completed |
| Phase 6: Monitoring | ✅ Completed |
| Phase 7: Notifications | ✅ Completed |
| Phase 8: Integration | ✅ Completed |
