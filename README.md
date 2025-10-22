# Superfunction (SPFN)

> **Type-safe backend for Next.js**

Next.js handles your frontend. SPFN handles your backend.

🌐 **[superfunction.xyz](https://superfunction.xyz)**

[![npm core](https://img.shields.io/npm/v/@spfn/core?label=%40spfn%2Fcore)](https://npmjs.com/package/@spfn/core)
[![npm cli](https://img.shields.io/npm/v/spfn?label=spfn)](https://npmjs.com/package/spfn)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-green?logo=node.js)](https://nodejs.org/)

> ⚠️ **Alpha Release**: SPFN is currently in alpha. APIs may change. Install with `@alpha` tag: `npx spfn@alpha init`

---

## When You Need SPFN

**🚀 Building a mobile app?**  
→ Next.js (landing page) + SPFN (API) = Complete solution

**💼 Building a SaaS product?**  
→ Next.js (marketing + dashboard) + SPFN (backend) = Full-stack

**🎯 Need these features?**  
✅ Complex business logic with transactions  
✅ Connection pools (PostgreSQL, Redis)  
✅ Background jobs & scheduled tasks  
✅ End-to-end type safety (Contract → Client)

**If you just need simple API routes, Next.js is enough.**  
**If you need a real backend, Next.js + SPFN.**

---

## Quick Start (5 min)

### Option 1: Create New Project (Recommended)

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

### Option 2: Add to Existing Next.js Project

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

### What You Get

After initialization, you'll have:

✅ **Server Structure** (`src/server/`)
- File-based routing with auto-discovery
- Example routes with contracts
- Database entities and migrations
- Development and production configs

✅ **Auto-Generated Client** (`src/lib/api.ts`)
- Type-safe API client for Next.js
- Auto-updated on contract changes (dev mode)
- Full TypeScript autocomplete

✅ **Infrastructure** (via Docker)
- PostgreSQL database
- Redis cache
- Docker configs for dev & production

### Next Steps

**1. Create your first route:**
```bash
# Example route structure
src/server/routes/
  users/
    contract.ts    # Define API contract
    index.ts       # GET /users
    [id]/
      index.ts     # GET /users/:id
```

**2. Define database schema:**
```bash
# Create/edit entity
src/server/entities/users.ts

# Generate migration
npx spfn@alpha db generate

# Apply migration
npx spfn@alpha db migrate
```

**3. Use in Next.js:**
```typescript
// app/page.tsx
import { api } from '@/lib/api'

export default async function Page() {
  const examples = await api.examples.list()

  return <div>{examples.length} examples</div>
  //           ^ Fully typed!
}
```

---

## Local Development Setup

**Don't have PostgreSQL or Redis installed?**

After running `spfn init`, you'll have a `docker-compose.yml` in your project root:

```bash
# Start PostgreSQL and Redis
docker compose up -d

# Stop services
docker compose down

# Stop and remove all data
docker compose down -v
```

**Connection strings** (already in `.env.local.example`):
```bash
DATABASE_URL=postgresql://spfn:spfn@localhost:5432/spfn_dev
REDIS_URL=redis://localhost:6379
```

Copy `.env.local.example` to `.env.local` and you're ready to go!

---

## How It Works

```typescript
// 1. Define contract (src/server/routes/users/contract.ts)
export const getUserContract = {
  method: 'GET',
  path: '/:id',
  params: Type.Object({ id: Type.String() }),
  response: Type.Object({
    id: Type.Number(),
    name: Type.String()
  })
};

// 2. Implement route (src/server/routes/users/[id]/index.ts)
import { createApp } from '@spfn/core/route';
import { findOne } from '@spfn/core/db';
import { getUserContract } from '../contract';
import { users } from '../../entities/users';

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

---

## Core Features

**🎯 Contract-based API**
- Define once, validated everywhere
- Auto-generated TypeScript client
- Full type safety from server to client
- OpenAPI compatible (coming soon)

**🗄️ Type-safe Database**
- Drizzle ORM with helper functions
- Type-safe CRUD operations (findOne, findMany, create, etc.)
- Transaction support (AsyncLocalStorage)
- Read/Write separation for scalability

**⚡ Production-Ready**
- Connection pooling (PostgreSQL, Redis)
- Comprehensive test coverage (518+ tests, 40%+ coverage)
- Integration tests for DB, cache, and server
- Docker support for dev & production

**📁 File-based Routing**
- `users/index.ts` → GET /users
- `users/[id].ts` → GET /users/:id
- Auto-discovery & registration
- Co-located contracts and handlers

**🔄 Developer Experience**
- Watch mode with auto-regeneration
- Hot reload for both frontend & backend
- Built-in error handling middleware
- Comprehensive logging with pino

**🧪 Testing Infrastructure**
- Unit tests for core modules (logger, errors, codegen, route, client, middleware, env)
- Integration tests for infrastructure (DB, cache, server)
- Vitest with optimized configs
- Docker Compose for test infrastructure

---

## Architecture

```
┌─────────────────────────────────┐
│  Next.js                        │
│  • Landing page                 │
│  • Marketing site               │
│  • Dashboard                    │
│  Port 3790                      │
└────────────┬────────────────────┘
             │
             │ Type-safe API calls
             │
┌────────────▼────────────────────┐
│  SPFN Backend                   │
│  • REST API                     │
│  • Business logic               │
│  • Transactions                 │
│  Port 8790                      │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│  PostgreSQL / Redis / etc.      │
└─────────────────────────────────┘
```

---

## Recent Updates

### v0.1.0-alpha.40 (Latest)

**🧪 Testing & Quality**
- Added 57 new tests (DB integration, middleware error handling)
- Test coverage increased to 40%+ (518+ total tests)
- Fixed DB type compatibility with Drizzle ORM
- Improved test isolation and configuration

**📦 What's Included**
- Comprehensive DB integration tests (40 tests)
  - Transaction context with AsyncLocalStorage
  - Auto-commit/rollback middleware
  - Helper functions CRUD operations
- Error handler middleware tests (17 tests)
- Enhanced cache module tests (70 tests)

**🔧 Improvements**
- Fixed TypeScript compatibility with Drizzle ORM
- Updated test infrastructure with better isolation
- Co-located contract pattern support
- Singleton client pattern

See [CHANGELOG.md](./CHANGELOG.md) for full history.

---

## Documentation

📚 **[Core API](./packages/core/README.md)** - Full documentation
🛠️ **[CLI Guide](./packages/cli/README.md)** - Commands & tools
📝 **[Testing Guide](./packages/core/TESTING.md)** - Test strategy & coverage

---

## Ecosystem

| Package                       | Status | Description          |
|-------------------------------|--------|----------------------|
| [@spfn/core](./packages/core) | 🚧 Alpha | Routing, DB, Transactions |
| [spfn](./packages/cli)       | 🚧 Alpha | CLI & Dev tools |
| @spfn/user                    | 📋 Planned | User management & authentication |
| @spfn/storage                 | 📋 Planned | File upload          |

---

## Requirements

- Node.js 18+
- Next.js 15+ (App Router)
- PostgreSQL (optional: Redis)

**Recommended:**
- Use App Router (required, not Pages Router)
- Use `src/` directory for better organization
- TypeScript for full type safety

---

## Community

💬 **[GitHub Discussions](https://github.com/spfn/spfn/discussions)** - Ask questions  
🐛 **[Issues](https://github.com/spfn/spfn/issues)** - Report bugs

---

## License

MIT © INFLIKE Inc.

**Built with ❤️ in Seoul for the Next.js community**