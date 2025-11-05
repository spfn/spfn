---
title: "Introduction"
description: "Type-safe backend for Next.js - Build real backend capabilities alongside your Next.js app"
order: 1
available: true
---

# Introduction

> **Type-safe backend for Next.js**

Next.js handles your frontend. Superfunction handles your backend.

## What is Superfunction?

Superfunction is an end-to-end type-safe backend architecture for Next.js that gives you real backend capabilities—not just a backend for frontend.

## Do You Need Superfunction?

**Simple API routes?** → Next.js is enough
**Real backend features?** → Next.js + Superfunction

### Next.js API Routes vs Superfunction

| Feature | Next.js API Routes | Superfunction |
|---------|-------------------|------|
| **Connection Pooling** | ❌ Creates new connection per request | ✅ Persistent connection pool |
| **Background Jobs** | ❌ Not supported | ✅ Queue system with scheduling |
| **Transactions** | ⚠️ Limited (single request scope) | ✅ Full ACID transactions |
| **Long-running Tasks** | ❌ 10s timeout (Vercel) | ✅ No timeout limits |
| **WebSocket/SSE** | ⚠️ Limited support | ✅ Full bidirectional support |
| **Type Safety** | ⚠️ Manual sync needed | ✅ E2E auto-generated client |
| **Deployment** | ✅ Simple (Vercel) | ✅ One codebase, deploy together |

### Use Superfunction When You Need:

- 📱 **Mobile apps** - Marketing page (Next.js) + API server (Superfunction) in one project
- 💼 **SaaS products** - Complex business logic with transactions
- 🔌 **Connection pools** - PostgreSQL, Redis without hitting limits
- ⏰ **Background jobs** - Email sending, data processing, scheduled tasks
- 🎯 **E2E type safety** - Contract → Backend → Client auto-sync

## How It Works

Superfunction uses a contract-based architecture:

1. **Define contracts** - Shared TypeBox schemas that define your API shape
2. **Implement routes** - Backend handlers with full type safety
3. **Use in Next.js** - Auto-generated type-safe client for your frontend

```typescript
// 1. Define contract (src/lib/contracts/users.ts)
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

export const getUserContract = {
  method: 'GET' as const,
  path: '/users/:id',
  params: Type.Object({ id: Type.String() }),
  response: Type.Object({
    id: Type.Number(),
    name: Type.String()
  })
} as const satisfies RouteContract;

// 2. Implement route (src/server/routes/users/[id]/index.ts)
import { createApp } from '@spfn/core/route';
import { NotFoundError } from '@spfn/core/errors';
import { findOne } from '@spfn/core/db';
import { getUserContract } from '@/lib/contracts/users';
import { users } from '@/server/entities';

const app = createApp();

app.bind(getUserContract, async (c) => {
  const user = await findOne(users, { id: c.params.id });
  if (!user) throw new NotFoundError('User', c.params.id);
  return c.json(user);
});

export default app;

// 3. Use in Next.js (auto-generated src/lib/api.ts)
import { api } from '@/lib/api'

const user = await api.users.getById({ params: { id: '123' } });
//    ^ Fully typed! No manual sync needed
```

## Next Steps

Ready to get started? Follow our [Quick Start](/docs/getting-started/quick-start) guide to create your first Superfunction project in under 5 minutes.