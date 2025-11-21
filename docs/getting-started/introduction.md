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
- 🎯 **E2E type safety** - Route → Backend → Client auto-sync with codegen

## How It Works

Superfunction uses a define-route system with end-to-end type safety:

1. **Define routes** - Type-safe route definitions with input/output schemas
2. **Generate client** - Auto-generate type-safe API client with one command
3. **Use in Next.js** - tRPC-style chaining with full type safety

```typescript
// 1. Define routes (src/server/routes/users.ts)
import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';
import { NotFoundError } from '@spfn/core/errors';
import { UserRepository } from '../repositories/user.repository';

const userRepo = new UserRepository();

export const getUser = route.get('/users/:id')
  .input({
    params: Type.Object({
      id: Type.String()
    })
  })
  .handler(async (c) => {
    const { params } = await c.data();
    const user = await userRepo.findById(params.id);

    if (!user) {
      throw new NotFoundError('User', params.id);
    }

    return user;
  });

// Create router (src/server/router.ts)
import { defineRouter } from '@spfn/core/route';
import * as userRoutes from './routes/users';

export const appRouter = defineRouter({
  getUser: userRoutes.getUser,
  // ... more routes
});

export type AppRouter = typeof appRouter;

// 2. Generate client (run once)
// $ pnpm spfn codegen router
// Creates: src/lib/api-client.ts

// 3. Use in Next.js (Client/Server Components, Server Actions)
import { api } from '@/lib/api-client';

// tRPC-style chaining with full type safety
const user = await api.getUser
  .params({ id: '123' })
  .call();
//    ^ Fully typed! Auto-synced from backend

// Type-safe error handling
try {
  await api.getUser.params({ id: '999' }).call();
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('User not found:', error.details);
    //                             ^ Typed!
  }
}
```

### Key Features

**🔄 Auto-Generated Client**
- Run `pnpm spfn codegen router` to generate type-safe client
- Includes ErrorRegistry for proper error deserialization
- No manual type sync needed

**🎯 tRPC-Style API**
- Chainable methods: `.params()`, `.query()`, `.body()`, `.call()`
- Full IntelliSense support
- Works in Client Components, Server Components, and Server Actions

**⚡ Error Handling**
- Server errors are automatically deserialized on client
- Use `instanceof` checks for type-safe error handling
- All HTTP errors (404, 401, etc.) + custom errors supported

## Next Steps

Ready to get started? Follow our [Quick Start](/docs/getting-started/quick-start) guide to create your first Superfunction project in under 5 minutes.