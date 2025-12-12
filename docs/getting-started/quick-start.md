---
title: "Quick Start"
description: "Get your Superfunction project up and running in 5 minutes"
order: 3
available: true
---

# Quick Start

Get your Superfunction project up and running in 5 minutes.

## Option 1: Create New Project (Recommended)

```bash
# Create new project with Superfunction + Next.js + TypeScript + Tailwind
npx spfn@alpha create my-app
cd my-app

# Start databases (Docker recommended, or use your own PostgreSQL)
docker compose up -d

# Copy environment variables
cp .env.local.example .env.local

# Start dev server
npm run spfn:dev
```

✅ Backend: http://localhost:8790
✅ Frontend: http://localhost:3790

## Option 2: Add to Existing Next.js Project

```bash
cd your-nextjs-project
npx spfn@alpha init

# Start databases
docker compose up -d

# Copy environment variables
cp .env.local.example .env.local

# Start dev server
npm run spfn:dev
```

## What You Get

After initialization, you'll have:

### ✅ Server Structure (`src/server/`)
- Define-route system with full type safety
- Example routes with CRUD operations
- Database entities and repositories
- Development and production configs

### ✅ Router (`src/server/router.ts`)
- Centralized route definitions
- Type exports for client generation
- Automatic metadata extraction

### ✅ Auto-Generated Client
- Type-safe API client for Next.js
- tRPC-style chaining API
- Auto-updated via codegen

### ✅ Infrastructure (via Docker)
- PostgreSQL database
- Redis cache
- Docker configs for dev & production

## Next Steps

### 1. Create your first route

```typescript
// src/server/routes/users.ts
import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({
            id: Type.String()
        })
    })
    .handler(async (c) => {
        const { params } = await c.data();
        // Fetch user from database
        return { id: params.id, name: 'John Doe' };
    });
```

### 2. Register route in router

```typescript
// src/server/router.ts
import { defineRouter } from '@spfn/core/route';
import { getUser } from './routes/users';

export const appRouter = defineRouter({
    getUser,
    // ... other routes
});

export type AppRouter = typeof appRouter;
```

### 3. Generate client and use in Next.js

```bash
# Generate type-safe client
pnpm spfn codegen router
```

```typescript
// app/page.tsx
import { api } from '@/lib/api-client';

export default async function Page() {
    const user = await api.getUser
        .params({ id: '123' })
        .call();

    return <div>{user.name}</div>;
    //           ^ Fully typed!
}
```

### 4. Define database schema

```bash
# Create/edit entity
src/server/entities/users.ts

# Generate migration
npx spfn@alpha db generate

# Apply migration
npx spfn@alpha db migrate
```

### 5. View your database (optional)

```bash
# Open Drizzle Studio to browse your database
pnpm spfn db studio
```

## Troubleshooting

### Database Connection Issues

If you see connection errors, make sure:
- Docker is running: `docker ps`
- Database is accessible: Check `.env.local` for correct `DATABASE_URL`
- No port conflicts: PostgreSQL default port is 5432

### Build Errors

If you encounter build errors:
- Check Node.js version: `node -v` (should be 18+)
- Clear cache: `rm -rf .next`
- Reinstall dependencies: `rm -rf node_modules && npm install`
