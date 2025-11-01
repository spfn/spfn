---
title: "Introduction"
description: "Type-safe backend for Next.js - Build real backend capabilities alongside your Next.js app"
order: 1
available: true
---

# Introduction

> **Type-safe backend for Next.js**

Next.js handles your frontend. SPFN handles your backend.

## What is SPFN?

SPFN is an end-to-end type-safe backend framework for Next.js that gives you real backend capabilities—not just a backend for frontend.

## When You Need SPFN

**🚀 Building a mobile app?**
→ Next.js (landing page) + SPFN (API) = Complete solution

**💼 Building a SaaS product?**
→ Next.js (marketing + dashboard) + SPFN (backend) = Full-stack

**⚡ Building with functions?**
→ SPFN functions = Plug & play features with automatic DB setup

**🎯 Need these features?**
- Complex business logic with transactions
- Connection pools (PostgreSQL, Redis)
- Background jobs & scheduled tasks
- End-to-end type safety (Contract → Client)
- Function ecosystem with auto-discovery

**If you just need simple API routes, Next.js is enough.**
**If you need a real backend, Next.js + SPFN.**

## Why SPFN?

Serverless functions in Next.js are great for simple use cases, but they fall short when you need:

- Persistent database connections without hitting connection limits
- Long-running background tasks
- Real-time bidirectional communication
- Complex transaction orchestration

SPFN solves these problems by running a dedicated backend server alongside your Next.js app—all in one project.

## How It Works

SPFN uses a contract-based architecture:

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
import { findOne } from '@spfn/core/db';
import { getUserContract } from '@/lib/contracts/users';
import { users } from '@/server/entities';

const app = createApp();

app.bind(getUserContract, async (c) => {
  const user = await findOne(users, { id: c.params.id });
  if (!user) return c.json({ error: 'User not found' }, 404);
  return c.json(user);
});

export default app;

// 3. Use in Next.js (auto-generated src/lib/api.ts)
import { api } from '@/lib/api'

const user = await api.users.getById({ params: { id: '123' } });
//    ^ Fully typed! No manual sync needed
```

## Next Steps

Ready to get started? Follow our [Quick Start](/docs/getting-started/quick-start) guide to create your first SPFN project in under 5 minutes.