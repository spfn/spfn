---
title: "Our Philosophy"
description: "The principles and values that guide Superfunction's design"
order: 0
available: true
---

# Our Philosophy

Superfunction is built on principles borrowed from Ruby on Rails, proven software practices, and modern TypeScript development.

## Inspired by Rails

Ruby on Rails revolutionized web development with its philosophy. Superfunction brings similar principles to TypeScript and Next.js:

### Convention over Configuration

**Rails:** File name determines route, model name determines table
```ruby
# app/controllers/posts_controller.rb
class PostsController < ApplicationController
  def index
    @posts = Post.all
  end
end
```

**Superfunction:** File-based routing, contract-driven generation
```typescript
// src/server/routes/posts/index.ts
import { getPostsContract } from '@/lib/contracts/posts';

app.bind(getPostsContract, async (c) => {
  const posts = await db.query.posts.findMany();
  return c.json({ posts });
});
```

### Don't Repeat Yourself (DRY)

**Rails:** Define once, use everywhere (ActiveRecord models)
```ruby
class User < ApplicationRecord
  validates :email, presence: true, uniqueness: true
end

# Validation, types, and database schema all from one definition
```

**Superfunction:** Contract as Single Source of Truth
```typescript
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core';

// Define once
export const createUserContract = {
  method: 'POST' as const,
  path: '/users',
  body: Type.Object({
    email: Type.String({ format: 'email' })
  }),
  response: UserSchema
} satisfies RouteContract;

// ✅ TypeScript types generated
// ✅ Runtime validation automatic
// ✅ API client created
// ✅ OpenAPI docs generated
```

### Optimize for Programmer Happiness

**Rails:** Make developers productive and joyful

**Superfunction:** Eliminate boilerplate, maximize productivity
```typescript
// ❌ Before: Manual typing, validation, client code
interface CreateUserBody { email: string; }
interface CreateUserResponse { id: number; email: string; }

async function createUser(body: CreateUserBody): Promise<CreateUserResponse> {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return response.json();
}

// ✅ After: Contract → Everything automatic
const user = await api.users.create({ body: { email: 'user@example.com' } });
// Fully typed, validated, generated
```

### The Omakase Stack

**Rails:** Curated tools that work together seamlessly
- ActiveRecord for database
- ActionView for templates
- ActiveJob for background jobs

**Superfunction:** Best-in-class TypeScript ecosystem
- PostgreSQL for database (25+ years proven)
- Next.js for frontend (industry standard)
- Hono for backend (modern, fast)
- TypeBox for validation (JSON Schema standard)
- Drizzle for ORM (type-safe SQL)

> **Omakase (おまかせ):** Japanese for "I'll leave it up to you." Trust the chef to select the best ingredients and prepare the best meal.

## Core Principles

### 1. Single Source of Truth

One contract definition powers your entire stack:

```typescript
// src/lib/contracts/posts.ts
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core';

export const createPostContract = {
  method: 'POST' as const,
  path: '/posts',
  body: Type.Object({
    title: Type.String({ minLength: 1, maxLength: 200 }),
    content: Type.String()
  }),
  response: PostSchema
} satisfies RouteContract;
```

**From this one definition:**
- ✅ TypeScript types extracted
- ✅ Runtime validation applied
- ✅ API client generated
- ✅ OpenAPI documentation created
- ✅ Backend handler typed
- ✅ Frontend calls typed
- ✅ Component props typed

**Contract types flow everywhere:**
```typescript
// 1. Extract types from contract
import type { InferContract } from '@spfn/core';
import { getPostsContract } from '@/lib/contracts/posts';

export type GetPostsResponse = InferContract<typeof getPostsContract>['response'];
export type Post = GetPostsResponse['items'][number];

// 2. Use in API calls
const { items: posts } = await api.posts.list();
// posts is fully typed

// 3. Use in component props
interface PostListProps {
  posts: Post[];
}

function PostList({ posts }: PostListProps) {
  return posts.map(post => (
    <PostCard key={post.id} post={post} />
  ));
}

// 4. Use in nested components
interface PostCardProps {
  post: Post; // Same type from contract!
}

function PostCard({ post }: PostCardProps) {
  return <div>{post.title}</div>;
}
```

**Why it matters:**
- No sync issues between types and validation
- Change once, update everywhere
- Impossible to have mismatched types
- Component props always match API responses

### 2. Proven Over Novel

Choose battle-tested technologies over trendy alternatives:

| Technology | Alternative | Why We Chose It |
|------------|-------------|-----------------|
| PostgreSQL | MySQL | 25+ years production, ACID, extensions |
| Next.js | Remix, Astro | Industry standard, proven at scale |
| Hono | Express, Fastify | Ultrafast, lightweight, zero dependencies |
| TypeBox | Zod, Yup | JSON Schema standard, 10x faster |

**Philosophy:**
- New isn't always better
- Stability matters in production
- Choose tools with longevity

### 3. Type Safety First

Catch errors at compile time, not production:

```typescript
// ❌ Runtime error (traditional approach)
const user = await fetch('/api/users/abc').then(r => r.json());
console.log(user.id.toUpperCase()); // Runtime error: id is number!

// ✅ Compile-time error (Superfunction)
const user = await api.users.getById({ params: { id: 'abc' } });
//                                              ^^^^^^^^
// TypeScript Error: Type 'string' is not assignable to type 'number'
```

**Benefits:**
- Errors caught during development
- Refactoring is safe
- IDE autocomplete everywhere
- No surprise runtime errors

### 4. Convention over Configuration

Sensible defaults, minimal configuration:

```typescript
// ❌ Other frameworks: Explicit configuration
app.post('/users',
  validateBody(createUserSchema),
  authenticate,
  async (req, res) => {
    // Handler
  }
);

// ✅ Superfunction: Convention-based
app.bind(createUserContract, async (c) => {
  // Validation automatic
  // Types automatic
  // Just write logic
});
```

**Conventions:**
- Organize routes by domain: `src/server/routes/users/index.ts` (contains user-related contracts)
- Contract naming: `getUserContract` → `api.users.get()`
- Automatic pluralization: `users.ts` → `api.users`

### 5. No Trade-offs

You shouldn't choose between performance and productivity:

**Performance AND Developer Experience:**
- TypeBox: Fast validation + type inference
- Hono: Fast routing + great DX
- Drizzle: Fast queries + type safety

**Type Safety AND Speed:**
- Compile-time type checking
- Runtime validation optimized
- Code generation at build time

**Simplicity AND Power:**
- Simple contract syntax
- Powerful middleware system
- Advanced features available when needed

### 6. Integrated System

Everything works together seamlessly:

```bash
my-app/
├── src/
│   ├── app/              # Next.js frontend
│   ├── server/           # Superfunction backend
│   └── lib/
│       ├── contracts/    # Shared contracts
│       └── api/          # Generated client
```

**One project, complete stack:**
- Frontend calls backend with type safety
- Backend validates with contracts
- Database queries with Drizzle ORM
- All TypeScript, all type-safe

### 7. Sharp Knives

Provide powerful tools, trust developers to use them responsibly:

**Rails philosophy:**
> "We're adults. We can handle sharp knives."

**Superfunction applies this:** No artificial limitations, full control when needed.

#### Break Conventions When Needed

```typescript
// ✅ Recommended: Use contracts and generated API
app.bind(getUserContract, async (c) => {
  const user = await db.query.users.findFirst(...);
  return c.json(user);
});

// ✅ Also allowed: Write raw Hono routes
app.get('/custom-endpoint', async (c) => {
  // No contract, no validation, full Hono control
  return c.json({ custom: 'response' });
});
```

#### Database Freedom

```typescript
import { findOne, findMany, create } from '@spfn/core/db';
import { getDatabase } from '@spfn/core/db';
import { usersTable } from '@/server/db/schema';

// ✅ Recommended: Use helper functions (simple, type-safe)
const user = await findOne(usersTable, { id: 1 });
const users = await findMany(usersTable, {
  where: { active: true },
  limit: 10
});
const newUser = await create(usersTable, {
  email: 'user@example.com',
  name: 'User'
});

// ✅ Also allowed: Direct Drizzle access (more power)
const db = getDatabase('read');
const users = await db.query.users.findMany({
  where: (users, { gt, and, eq }) => and(
    gt(users.createdAt, new Date('2024-01-01')),
    eq(users.active, true)
  ),
  with: { posts: true }
});

// ✅ Maximum freedom: Raw SQL for complex queries
const db = getDatabase('write');
const results = await db.execute(sql`
  WITH RECURSIVE category_tree AS (
    SELECT id, name, parent_id, 1 as level
    FROM categories WHERE parent_id IS NULL
    UNION ALL
    SELECT c.id, c.name, c.parent_id, ct.level + 1
    FROM categories c
    INNER JOIN category_tree ct ON c.parent_id = ct.id
  )
  SELECT * FROM category_tree ORDER BY level, name
`);
```

#### Deployment Freedom

**Option 1: All-in-one deployment (Recommended)**

```bash
# Docker (full control)
docker-compose up
# Provided docker-compose.yml with PostgreSQL

# Railway, Render, Fly.io (easy deployment)
git push
# Automatic deployment with persistent process

# Your own server (maximum control)
pnpm run spfn:build  # or: npx spfn build
pnpm run spfn:start  # or: npx spfn start
```

**Why this works best:**
- ✅ Persistent connection pooling (no cold starts)
- ✅ Single deployment, easier monitoring
- ✅ Simple CORS configuration

**Option 2: Split deployment (Vercel + separate server)**

```bash
# Next.js → Vercel (excellent Next.js hosting)
# Superfunction server → Railway/Render/VPS

# Build only server
pnpm run spfn:build --server-only

# Deploy separately
vercel deploy          # Next.js frontend
railway up             # Superfunction backend
```

**When to use split deployment:**
- ✅ You want Vercel's Next.js optimizations
- ✅ You need connection pooling for database
- ⚠️ Requires managing two services
- ⚠️ Need to configure CORS

**No vendor lock-in:**
- Standard Docker setup
- Works on any platform with persistent Node.js
- PostgreSQL anywhere (Supabase, Neon, self-hosted)
- No platform-specific code

#### Skip Safety When Needed

```typescript
// Skip middleware for specific endpoints
export const publicContract = {
  method: 'GET' as const,
  path: '/public',
  response: Schema,
  meta: {
    skipMiddlewares: ['auth'] // Bypass auth for this endpoint
  }
};

// Use any type when you need to
const data: any = await externalAPI.fetch(); // Escape hatch
```

**The philosophy:**
- Conventions are defaults, not restrictions
- Type safety is recommended, not enforced
- Deploy anywhere, not just Vercel
- Use escape hatches when you need them
- We trust you to make the right choice

## Design Decisions

### Why File-Based Routing?

**Rails convention:** File location determines URL

**Superfunction:** Different approach - contract determines URL, file structure is for organization

```typescript
// src/server/routes/users/index.ts
export const getUserContract = {
  method: 'GET' as const,
  path: '/users',  // ← This defines the actual API route
  response: UserSchema
} satisfies RouteContract;

// File location doesn't affect the route!
// This file could be anywhere, contract.path determines the URL
```

**Recommended file structure** (for clarity, not enforcement):

```bash
src/server/routes/
├── users/
│   ├── index.ts          # Contains /users contracts
│   └── [id]/
│       └── index.ts      # Contains /users/:id contracts
└── posts/
    ├── index.ts          # Contains /posts contracts
    └── [slug]/
        └── index.ts      # Contains /posts/:slug contracts
```

**Key difference:**
- **Rails:** File location → URL (enforced)
- **Superfunction:** Contract path → URL (enforced), File structure → Organization (recommended)

**Why this matters:**
- Contract is the single source of truth for routing
- File structure helps developers find related routes quickly
- No magic file-to-URL mapping to remember
- Freedom to organize files however you want

### Why Contract-First?

**API-first design:**
1. Define contract
2. Frontend/backend implement independently
3. Contract ensures compatibility

**Benefits:**
- Parallel development
- Clear API boundaries
- Type safety guaranteed

### Why Single Project?

**Traditional approach:** Separate repositories
- `frontend/` (Next.js)
- `backend/` (Express/Hono)
- `shared/` (types)

**Superfunction:** Two servers, one project
- One `package.json`
- Two separate server processes (Next.js + Hono)
- Shared contracts and types

**Advantages:**
- **Lower cognitive load:** Feels like one project, not three
  - Traditional monorepo: `frontend/` + `backend/` + `shared/` = 3 projects to think about
  - Superfunction: Just write code
- **Type sharing:** Natural via contracts (no package publishing)
- **Single deployment:** One build, one deployment
- **Next.js-like DX:** We're building tools to make backend development as easy as Next.js frontend
  - Simple commands (`spfn dev`, `spfn build`)
  - Auto-reload, auto-generation
  - Convention over configuration

**Trade-offs:**
- Larger `node_modules` (frontend deps + backend deps)
- Frontend packages installed on server side
- Backend packages installed on frontend side

> **Note:** We're actively working to improve this with better dependency separation.

**Why it's worth it:**
- Developer experience >>> disk space
- Significantly lower cognitive load
- No mental context switching between repositories
- Refactoring across stack is seamless
- One place to find everything

## What Superfunction Is Not

### Not a Framework

Superfunction is a **tool** built on existing frameworks:
- Uses Next.js (not replacing it)
- Uses Hono (not wrapping it)
- Enhances with type safety and generation

### Not Opinionated About Everything

**Opinionated:**
- Contract definition (TypeBox)
- Database (PostgreSQL + Drizzle)
- Frontend (Next.js)

**Unopinionated:**
- UI library (use any React library)
- State management (use what you prefer)
- Styling (Tailwind, CSS-in-JS, anything)
- Authentication (implement your way)

### Not Black Box Magic

Minimal automation, maximum transparency:
- **Generated code is readable TypeScript:** API client you can understand and debug
- **Conventional defaults with escape hatches:** Auto-handles server config, Drizzle setup
  - Convention: Auto-generated configuration for DX
  - Override: Write your own config when needed
- **Standard frameworks:** Next.js and Hono code, no proprietary runtime
- **No hidden proxies:** Direct function calls, not Proxy-based magic

**What we auto-handle:**
- Server setup and initialization
- Database connection configuration
- Route registration and middleware
- API client generation

**What you can override:**
- Custom server configuration
- Manual Drizzle setup
- Direct Hono route registration
- Custom API client code

> We automate the boring stuff, but never hide what's happening.

## Influenced By

**Ruby on Rails**
- Convention over configuration
- Programmer happiness
- Integrated system

**tRPC**
- End-to-end type safety
- Contract-based API
- Great developer experience

**Prisma**
- Type-safe database access
- Schema-first approach
- Auto-generated client

**Next.js**
- File-based routing
- Zero-config defaults
- Production-ready

## Join the Philosophy

Superfunction is for developers who believe:
- ✅ Type safety prevents bugs
- ✅ Conventions reduce boilerplate
- ✅ Proven tools beat trendy ones
- ✅ Developer experience matters
- ✅ One source of truth eliminates sync issues

**Get started:**
```bash
npx spfn@alpha create my-app
cd my-app
pnpm run spfn:dev  # or: npm run spfn:dev
```

> **Next Steps:**
>
> Learn why we chose each technology in our stack.
>
> [Why PostgreSQL? →](/docs/philosophy/why-postgresql)