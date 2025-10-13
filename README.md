# Superfunction (SPFN)

> **Type-safe backend for Next.js**

Next.js handles your frontend. SPFN handles your backend.

🌐 **[superfunction.xyz](https://superfunction.xyz)**

[![npm](https://img.shields.io/npm/v/@spfn/core)](https://npmjs.com/package/@spfn/core)
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
# Create new project with SPFN + Next.js + TypeScript + Tailwind + SVGR
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
npm run spfn:dev
```

**3. Generate boilerplate** (The magic ✨)
```bash
npx spfn@alpha generate users
```

**Done!** You just created:

✅ Entity template (entities/users.ts)  
✅ Type-safe REST API (5 CRUD endpoints)  
✅ Repository with pagination  
✅ Auto-generated client for Next.js

**4. Use in Next.js** (Ready to use!)
```typescript
// app/page.tsx
import { api } from '@/lib/api'

export default async function Page() {
  const users = await api.users.list()
  const user = await api.users.getById({ params: { id: '123' } })

  return <div>{user.name}</div>
  //           ^ Fully typed!
}
```

**Next: Customize your entity**
```bash
# Edit entities/users.ts - Add fields (email, name, etc.)
# Then migrate:
npx spfn@alpha db generate
npx spfn@alpha db migrate
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
import { bind } from '@spfn/core';

export const GET = bind(getUserContract, async (c) => {
  const user = await repo.findById(c.params.id);
  return c.json(user);
});

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
- OpenAPI compatible (coming soon)

**🗄️ Type-safe Database**
- Drizzle ORM with Repository pattern
- Automatic pagination & filtering
- Transaction support (AsyncLocalStorage)

**⚡ Always-on Runtime**
- Connection pooling (PostgreSQL, Redis)
- Background workers
- WebSocket support

**📁 File-based Routing**
- `users/index.ts` → GET /users
- `users/[id].ts` → GET /users/:id
- Auto-discovery & registration

**🔄 Watch Mode** (Dev only)
- Contract changes → Auto-regenerate client
- No manual sync needed
- Hot reload for both frontend & backend

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

## Documentation

📚 **[Core API](./packages/core/README.md)** - Full documentation
🛠️ **[CLI Guide](./packages/spfn/README.md)** - Commands & tools

---

## Ecosystem

| Package                       | Status | Description          |
|-------------------------------|--------|----------------------|
| [@spfn/core](./packages/core) | 🚧 Alpha | Routing, DB, Transactions |
| [spfn](./packages/spfn)       | 🚧 Alpha | CLI & Dev tools |
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