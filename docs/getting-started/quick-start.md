---
title: "Quick Start"
description: "Get your SPFN project up and running in 5 minutes"
order: 3
available: true
---

# Quick Start

Get your SPFN project up and running in 5 minutes.

## Option 1: Create New Project (Recommended)

```bash
# Create new project with SPFN + Next.js + TypeScript + Tailwind
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
- Contract-based routing with type safety
- Example routes with contracts
- Database entities and migrations
- Development and production configs

### ✅ Contracts (`src/lib/contracts/`)
- Centralized API contract definitions
- Shared between server and client
- Full type safety and validation

### ✅ Auto-Generated Client (`src/lib/api/`)
- Type-safe API client for Next.js
- Resource-based file splitting for scalability
- Auto-updated on contract changes (dev mode)
- Full TypeScript autocomplete

### ✅ Infrastructure (via Docker)
- PostgreSQL database
- Redis cache
- Docker configs for dev & production

## Next Steps

### 1. Create your first route

```bash
# 1. Define contract (centralized)
src/lib/contracts/
  users.ts       # API contracts for users

# 2. Implement routes
src/server/routes/
  users/
    index.ts     # GET /users (implements getUsersContract)
    [id]/
      index.ts   # GET /users/:id (implements getUserContract)
```

### 2. Define database schema

```bash
# Create/edit entity
src/server/entities/users.ts

# Generate migration
npx spfn@alpha db generate

# Apply migration
npx spfn@alpha db migrate
```

### 3. Use in Next.js

```typescript
// app/page.tsx
import { api } from '@/lib/api'

export default async function Page() {
  const examples = await api.examples.list()

  return <div>{examples.length} examples</div>
  //           ^ Fully typed!
}
```

### 4. Install functions (optional)

```bash
# Install CMS with automatic migration setup (recommended)
pnpm spfn add @spfn/cms

# Or install manually
pnpm add @spfn/cms
pnpm spfn db push

# View your database
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