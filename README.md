# Superfunction (SPFN)

> **Type-safe backend for Next.js**

Next.js handles your frontend. SPFN handles your backend.

[![npm](https://img.shields.io/npm/v/@spfn/core)](https://npmjs.com/package/@spfn/core)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

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

## Quick Start (3 min)

**1. Install**
```bash
cd your-nextjs-project
npx spfn@alpha init
```

**2. Start dev server**
```bash
npm run spfn:dev
```
✅ Backend: http://localhost:8790
✅ Frontend: http://localhost:3790

**3. Generate boilerplate** (The magic ✨)
```bash
npx spfn@alpha generate users
```

**Done!** You just created:
- ✅ Entity template (entities/users.ts)
- ✅ Type-safe REST API (5 CRUD endpoints)
- ✅ Repository with pagination
- ✅ Auto-generated client for Next.js

**4. Use in Next.js** (즉시 사용 가능!)
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
🛠️ **[CLI Guide](./packages/cli/README.md)** - Commands & tools
🔐 **[Auth (Alpha)](./packages/auth/README.md)** - Authentication

---

## Ecosystem

| Package | Status | Description |
|---------|--------|-------------|
| [@spfn/core](./packages/core) | 🚧 Alpha | Routing, DB, Transactions |
| [@spfn/cli](./packages/cli) | 🚧 Alpha | Dev tools & generators |
| [@spfn/auth](./packages/auth) | 🚧 Alpha | Client-key authentication |
| @spfn/storage | 📋 Planned | File upload (S3, Cloudinary) |
| @spfn/email | 📋 Planned | Email (Resend, SendGrid) |

---

## Requirements

- Node.js 18+
- Next.js 15+ (App Router)
- PostgreSQL (optional: Redis)

---

## Community

💬 **[GitHub Discussions](https://github.com/spfn/spfn/discussions)** - Ask questions
🐛 **[Issues](https://github.com/spfn/spfn/issues)** - Report bugs
🌟 **[Changelog](./CHANGELOG.md)** - What's new

---

## License

MIT © [SPFN Team](https://github.com/spfn/spfn)

**Built with ❤️ for the Next.js community**