# Quick Start: Your First API Endpoint

Build a working REST API in 5 minutes. This guide walks you through creating a complete CRUD API for managing tasks.

## Prerequisites

```bash
# 1. Ensure database is running
docker compose up -d

# 2. Create .env.local if not exists
cp .env.local.example .env.local

# 3. Start dev server
npm run spfn:dev
```

Your dev server should be running:
- Backend API: http://localhost:8790
- Next.js: http://localhost:3790

---

## Step 1: Generate Boilerplate (30 seconds)

SPFN can generate all boilerplate code for you:

```bash
npx spfn generate tasks
```

This creates:
- `src/server/entities/tasks.ts` - Database schema
- `src/server/repositories/tasks.repository.ts` - Data access
- `src/server/routes/tasks/contract.ts` - API contracts
- `src/server/routes/tasks/index.ts` - Route handlers
- `src/server/routes/tasks/[id]/index.ts` - Single task routes
- `src/lib/api.ts` - Type-safe client (auto-generated)

---

## Step 2: Customize Entity (1 minute)

Edit `src/server/entities/tasks.ts` to add your fields:

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';

export const tasks = pgTable('tasks', {
  id: id(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status', {
    enum: ['todo', 'in_progress', 'done']
  }).notNull().default('todo'),
  ...timestamps()
});

// Export types for TypeScript
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
```

---

## Step 3: Generate and Run Migration (30 seconds)

```bash
# Generate migration from your schema
npx spfn db generate

# Run migration to create table
npx spfn db migrate
```

Your database now has a `tasks` table with all the fields!

---

## Step 4: Test Your API (1 minute)

The generated routes are ready to use:

### Create a task
```bash
curl -X POST http://localhost:8790/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Learn SPFN",
    "description": "Build my first API",
    "status": "in_progress"
  }'
```

### List all tasks
```bash
curl http://localhost:8790/tasks
```

### Get single task
```bash
curl http://localhost:8790/tasks/1
```

### Update task
```bash
curl -X PATCH http://localhost:8790/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"status": "done"}'
```

### Delete task
```bash
curl -X DELETE http://localhost:8790/tasks/1
```

---

## Step 5: Use in Next.js (1 minute)

The type-safe client is auto-generated in `src/lib/api.ts`:

```typescript
// app/page.tsx or app/tasks/page.tsx
import { api } from '@/lib/api';

export default async function TasksPage() {
  // ✅ Fully typed! No manual sync needed
  const tasks = await api.tasks.list();

  return (
    <div>
      <h1>My Tasks</h1>
      {tasks.map(task => (
        <div key={task.id}>
          <h2>{task.title}</h2>
          <p>{task.description}</p>
          <span>{task.status}</span>
        </div>
      ))}
    </div>
  );
}
```

### Create task from frontend

```typescript
// app/tasks/new/page.tsx
'use client';

import { api } from '@/lib/api';
import { useState } from 'react';

export default function NewTaskPage() {
  const [title, setTitle] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // ✅ Fully typed request and response
    const task = await api.tasks.create({
      body: {
        title,
        description: '',
        status: 'todo'
      }
    });

    console.log('Created task:', task);
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Task title"
      />
      <button type="submit">Create Task</button>
    </form>
  );
}
```

---

## What You Built

Congratulations! You now have:

✅ **Database** - PostgreSQL table with schema
✅ **Repository** - Data access with pagination, filtering
✅ **5 REST APIs** - GET, POST, PATCH, DELETE endpoints
✅ **Type Safety** - End-to-end types from DB → API → Frontend
✅ **Auto-Generated Client** - No manual API calls needed

---

## Architecture Explained

SPFN follows a layered architecture:

```
┌─────────────────────────────────────┐
│  Frontend (Next.js)                 │  React components
│  - Uses generated api.ts client    │
│  - Fully typed, no manual sync     │
└──────────────┬──────────────────────┘
               │ HTTP (type-safe)
┌──────────────▼──────────────────────┐
│  Routes (API Handlers)              │  HTTP layer
│  - Validate requests via contracts │
│  - Thin handlers, delegate logic   │
│  - Return JSON responses           │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Repositories (Data Access)         │  Database layer
│  - CRUD operations                  │
│  - Pagination & filtering           │
│  - Custom query methods             │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Entities (Schema)                  │  Data models
│  - Drizzle ORM tables               │
│  - TypeScript types                 │
└─────────────────────────────────────┘
```

**Why this structure?**
- ✅ **Separation of Concerns** - Each layer has one job
- ✅ **Testability** - Test each layer independently
- ✅ **Type Safety** - Types flow from DB → Routes → Frontend
- ✅ **Maintainability** - Easy to find and modify code

---

## Next Steps

### Add Business Logic

For complex operations, create a service layer:

```typescript
// src/server/services/tasks.ts
import { getRepository } from '@spfn/core/db';
import { tasks } from '../entities/tasks';
import { TaskRepository } from '../repositories/tasks.repository';

export async function completeTask(taskId: string) {
  const repo = getRepository(tasks, TaskRepository);

  // Business logic here
  const task = await repo.findById(taskId);
  if (!task) throw new Error('Task not found');
  if (task.status === 'done') throw new Error('Already completed');

  return repo.update(taskId, {
    status: 'done',
    completedAt: new Date()
  });
}
```

### Add Validation

Enhance contracts with more specific validation:

```typescript
// src/server/routes/tasks/contract.ts
import { Type } from '@sinclair/typebox';

export const createTaskContract = {
  method: 'POST' as const,
  path: '/',
  body: Type.Object({
    title: Type.String({
      minLength: 3,
      maxLength: 100
    }),
    description: Type.Optional(Type.String({
      maxLength: 500
    })),
    status: Type.Union([
      Type.Literal('todo'),
      Type.Literal('in_progress'),
      Type.Literal('done')
    ])
  }),
  response: Type.Object({
    id: Type.String(),
    title: Type.String(),
    status: Type.String()
  })
};
```

### Add Relationships

Link tasks to users:

```typescript
// src/server/entities/tasks.ts
import { foreignKey } from '@spfn/core/db';
import { users } from './users';

export const tasks = pgTable('tasks', {
  id: id(),
  userId: foreignKey('user', () => users.id),  // Link to user
  title: text('title').notNull(),
  ...timestamps()
});
```

### Add Transactions

Wrap multiple operations in a transaction:

```typescript
// src/server/routes/tasks/index.ts
import { Transactional } from '@spfn/core/db';

app.bind(
  createTaskContract,
  Transactional(),  // Add transaction middleware
  async (c) => {
    const repo = getRepository(tasks);
    const activityRepo = getRepository(activities);

    // Both succeed or both rollback
    const task = await repo.save(await c.data());
    await activityRepo.save({
      userId: task.userId,
      action: 'task_created',
      taskId: task.id
    });

    return c.json(task, 201);
  }
);
```

---

## Common Patterns

### Pagination

```typescript
const page = await repo.findPage({
  pagination: { page: 1, limit: 20 },
  filters: { status: 'todo' },
  sort: [{ field: 'createdAt', direction: 'desc' }]
});

// Returns: { data: Task[], total: number, page: number, limit: number }
```

### Custom Queries

Extend repository with custom methods:

```typescript
// src/server/repositories/tasks.repository.ts
import { eq } from 'drizzle-orm';
import { Repository } from '@spfn/core/db';
import { tasks } from '../entities/tasks';

export class TaskRepository extends Repository<typeof tasks> {
  async findByStatus(status: string) {
    return this.findWhere({ status });
  }

  async findOverdue() {
    const results = await this.db
      .select()
      .from(this.table)
      .where(eq(this.table.status, 'todo'));

    return results;
  }
}
```

---

## Troubleshooting

### "Database not initialized"
```bash
# Add to src/server before routes
import { createDatabaseFromEnv } from '@spfn/core/db';
createDatabaseFromEnv();
```

### Routes not loading
```bash
# Check file export
export default app;  // Must export Hono instance

# Check dev server is running
npm run spfn:dev
```

### TypeScript errors
```bash
# Regenerate client
npm run spfn:dev  # Auto-watches and regenerates

# Or manually
npx spfn generate tasks --only contract
```

---

## Learn More

- **Full Architecture Guide** - `node_modules/@spfn/core/README.md`
- **Routing Docs** - `node_modules/@spfn/core/src/route/README.md`
- **Database Guide** - `node_modules/@spfn/core/src/db/README.md`
- **Deployment** - See [deployment.md](./deployment.md) in this directory

---

**Ready to deploy?** → [Deployment Guide](./deployment.md)