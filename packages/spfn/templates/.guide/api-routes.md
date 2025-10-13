# SPFN Best Practices

## Core Philosophy

### 1. **Shared Types Between Next.js ↔ Server**

The most important philosophy of SPFN is **sharing the same types between frontend and backend**.

**❌ Wrong Approach (Type Duplication):**
```typescript
// Backend: src/server/routes/users/index.ts
interface User {  // ❌ Defined only in server
  id: number;
  name: string;
}

// Frontend: src/app/users/page.tsx
interface User {  // ❌ Same type redefined
  id: number;
  name: string;
}
```

**✅ Correct Approach (Shared Types):**
```typescript
// Shared: src/types/user.ts
export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

export interface CreateUserRequest {
  name: string;
  email: string;
}

// Backend: src/server/routes/users/index.ts
import type { User, CreateUserRequest } from '@/types/user';

export async function POST(c: RouteContext) {
  const data = await c.data<CreateUserRequest>();
  // ...
  return c.json<User>(newUser);
}

// Frontend: src/app/users/page.tsx
import type { User } from '@/types/user';
import { api } from '@/lib/api';  // Auto-generated!

async function getUsers(): Promise<User[]> {
  return api.users.getUsers();  // Type-safe & auto-generated
}
```

---

### 2. **RouteContext Usage (Hono Wrapping Strategy)**

SPFN **wraps** Hono's Context to provide a more convenient API, while keeping full access to Hono's original Context via `c.raw`.

#### ❌ Don't Use `c.req` Directly
```typescript
// This DOES NOT work in SPFN!
export async function POST(c: RouteContext) {
  const body = await c.req.json();  // ❌ Error: 'req' doesn't exist on RouteContext
  return c.json({ ... });
}
```

#### ✅ Use SPFN's Wrapped API
```typescript
import type { RouteContext } from '@spfn/core';

export async function POST(c: RouteContext) {
  // ✅ Request Body (SPFN wrapper)
  const body = await c.data<CreateUserRequest>();

  // ✅ Path Parameters (SPFN wrapper)
  const userId = c.params.id;  // /users/:id

  // ✅ Query Parameters (SPFN wrapper)
  const page = c.query.page;   // /users?page=1

  // ✅ Pageable (SPFN-only feature, Spring Boot style)
  const { filters, sort, pagination } = c.pageable;

  // ✅ JSON Response (same as Hono)
  return c.json<User>(result);
}
```

#### ✅ Access Original Hono Context via `c.raw`
When you need Hono's native features, use `c.raw`:

```typescript
export async function POST(c: RouteContext) {
  // ✅ Headers (via c.raw)
  const authHeader = c.raw.req.header('Authorization');
  const contentType = c.raw.req.header('Content-Type');

  // ✅ Cookies (via c.raw)
  const sessionToken = c.raw.req.cookie('session');

  // ✅ Set Response Headers (via c.raw)
  c.raw.header('X-Custom-Header', 'value');
  c.raw.header('Cache-Control', 'no-cache');

  // ✅ Context Variables - Share data between middlewares (via c.raw)
  const userId = c.raw.get('userId');
  c.raw.set('requestId', crypto.randomUUID());

  // ✅ File Upload (via c.raw)
  const formData = await c.raw.req.formData();
  const file = formData.get('file');

  // ✅ Raw Request object (via c.raw)
  const method = c.raw.req.method;
  const url = c.raw.req.url;

  // You can still use SPFN's wrapped methods
  const body = await c.data<CreateUserRequest>();

  return c.json({ success: true });
}
```

**Summary:**
- **SPFN wrappers**: `c.data()`, `c.params`, `c.query`, `c.pageable`, `c.json()`
- **Hono original**: Everything via `c.raw` (e.g., `c.raw.req.header()`, `c.raw.req.cookie()`)
- **Both work together**: Use SPFN for convenience, `c.raw` for advanced Hono features

---

### 3. **Auto-Generated API Client**

SPFN automatically generates type-safe API clients from your routes.

#### Setup

Add to `package.json`:
```json
{
  "scripts": {
    "generate": "tsx node_modules/@spfn/core/dist/scripts/watch-all.js",
    "generate:api": "tsx node_modules/@spfn/core/dist/scripts/generate-api-client.js",
    "generate:types": "tsx node_modules/@spfn/core/dist/scripts/generate-types.js"
  }
}
```

#### Watch Mode (Recommended)
```bash
npm run generate
```

This watches for changes and auto-regenerates:
- **Routes change** → API client regenerates (`src/lib/api/`)
- **Entities change** → Types regenerate (after migration)

#### Manual Generation
```bash
npm run generate:api    # Generate API client
npm run generate:types  # Generate types from entities
```

#### Generated API Client Usage

**Backend Route:**
```typescript
// src/server/routes/users/index.ts
import type { User, CreateUserRequest } from '@/types/user';

export const meta = { tags: ['users'] };

export async function GET(c: RouteContext) {
  const users = await db.select().from(usersTable);
  return c.json<User[]>(users);
}

export async function POST(c: RouteContext) {
  const data = await c.data<CreateUserRequest>();
  const [user] = await db.insert(usersTable).values(data).returning();
  return c.json<User>(user);
}
```

**Auto-Generated Client:**
```typescript
// src/lib/api/users.ts (auto-generated)
export const users = {
  getUsers: () => request<User[]>('/users'),
  createUsers: (data: CreateUserRequest) => request<User>('/users', 'POST', data),
};
```

**Frontend Usage:**
```typescript
// src/app/users/page.tsx
import { api } from '@/lib/api';
import type { User } from '@/types/user';

export default async function UsersPage() {
  // ✅ Type-safe, auto-completed
  const users = await api.users.getUsers();

  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```

---

### 4. **Recommended Project Structure**

```
your-nextjs-project/
├── src/
│   ├── app/                          # Next.js App Router (Frontend)
│   │   ├── users/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   │
│   ├── types/                        # 🔥 Shared Types (Frontend ↔ Backend)
│   │   ├── user.ts                   # User-related types
│   │   ├── post.ts                   # Post-related types
│   │   └── api.ts                    # API Request/Response types
│   │
│   ├── lib/                          # Frontend utilities
│   │   └── api/                      # ⚡ Auto-generated API clients
│   │       ├── index.ts              # Aggregated exports
│   │       ├── users.ts              # User API client
│   │       └── posts.ts              # Post API client
│   │
│   └── server/                       # SPFN Backend
│       ├── routes/                   # API Routes
│       │   ├── users/
│       │   │   ├── index.ts          # GET /users, POST /users
│       │   │   └── [id].ts           # GET /users/:id
│       │   └── posts/
│       │       └── index.ts
│       │
│       ├── entities/                 # Drizzle Entities
│       │   └── users.ts
│       │
│       ├── middleware/               # Custom Middleware (optional)
│       │   └── auth.ts
│       │
│       └── server.config.ts          # Server Config (optional)
│
└── package.json
```

---

### 5. **Entities vs Types**

#### Entity = Database Schema
```typescript
// src/server/entities/users.ts
import { pgTable, serial, varchar, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

#### Type = API Contract (Shared with Frontend)
```typescript
// src/types/user.ts (auto-generated or manual)
export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

export interface CreateUserRequest {
  name: string;
  email: string;
}
```

---

### 6. **TypeScript Path Aliases**

Simplify imports with `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@/types/*": ["./src/types/*"],
      "@/server/*": ["./src/server/*"],
      "@/lib/*": ["./src/lib/*"]
    }
  }
}
```

Usage:
```typescript
// ❌ Relative paths (avoid)
import { User } from '../../../types/user';
import { users } from '../../entities/users';

// ✅ Use aliases
import type { User } from '@/types/user';
import { users } from '@/server/entities/users';
import { api } from '@/lib/api';
```

---

## Quick Reference

### RouteContext API Comparison

| Feature | SPFN Wrapper | Hono Original (via c.raw) |
|---------|--------------|---------------------------|
| Request Body | `c.data<T>()` | `c.raw.req.json()` |
| Path Params | `c.params.id` | `c.raw.req.param('id')` |
| Query Params | `c.query.page` | `c.raw.req.query('page')` |
| Headers | `c.raw.req.header('...')` | ✅ |
| Cookies | `c.raw.req.cookie('...')` | ✅ |
| Response | `c.json()` | `c.raw.json()` |
| Pagination | `c.pageable` | ❌ (SPFN-only) |
| Context Variables | `c.raw.get()` / `c.raw.set()` | ✅ |
| Raw Request | `c.raw.req` | ✅ |

### Why SPFN Wraps Hono Context

**Benefits:**
- 🎯 Simpler API for common operations
- 🔒 Type-safe request parsing with `c.data<T>()`
- 📊 Built-in pagination support (`c.pageable`)
- 🚀 Spring Boot-inspired developer experience
- 🔓 **Full Hono access via `c.raw`** - No limitations!

**Example - Combining Both:**
```typescript
export async function POST(c: RouteContext) {
  // SPFN wrapper (simple & type-safe)
  const body = await c.data<CreateUserRequest>();
  const userId = c.params.id;

  // Hono original (advanced features)
  const authToken = c.raw.req.header('Authorization');
  c.raw.set('userId', userId);

  return c.json({ success: true });
}
```

---

### Auto-Generated API Client Commands

```bash
# Start watch mode (recommended for development)
npm run generate

# Manually generate API client from routes
npm run generate:api

# Manually generate types from entities
npm run generate:types
```

---

## Learn More

- [SPFN Core Documentation](https://spfn.dev/docs)
- [Hono Documentation](https://hono.dev) - Full Hono API available via `c.raw`
- [Next.js Documentation](https://nextjs.org/docs)
- [Drizzle ORM](https://orm.drizzle.team/)