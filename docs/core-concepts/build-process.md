---
title: "Build Process"
description: "Understand how Superfunction builds and transforms your application for production"
order: 7
available: true
---

# Build Process

Superfunction's build process orchestrates Next.js and Hono server builds, registers routes from your router definition, and optimizes your application for production deployment.

## Build Architecture

```bash
spfn build
│
├─ Step 1: Route Registration
│  └─ Output: Routes registered from defineRouter()
│
├─ Step 2: Server Build
│  └─ Output: dist/server/ (Compiled Hono server)
│
└─ Step 3: Next.js Build
   └─ Output: .next/ (Optimized frontend)
```

## Step 1: Route Registration

Superfunction registers all routes defined in your router using `defineRouter()`. No separate contract files needed.

### Router Definition

```typescript
// src/server/router.ts
import { route, defineRouter } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) =>
    {
        const { params } = await c.data();
        return { id: params.id, name: 'John Doe' };
    });

export const createUser = route.post('/users')
    .input({
        body: Type.Object({
            name: Type.String(),
            email: Type.String()
        })
    })
    .handler(async (c) =>
    {
        const { body } = await c.data();
        return { id: '1', ...body };
    });

// Define router with all routes
export const appRouter = defineRouter({
    getUser,
    createUser,
});

export type AppRouter = typeof appRouter;
```

### Route Registration Process

```typescript
// At build/runtime, routes are registered automatically:
// 1. Server config loads router
// 2. registerRoutes() walks the router tree
// 3. Each route is registered with Hono

// src/server/server.config.ts
import { defineServerConfig } from '@spfn/core/server';
import { appRouter } from './router';

export default defineServerConfig()
    .routes(appRouter)  // ← Routes registered here
    .build();
```

### Type Inference

Types flow directly from your route definitions—no code generation step:

```typescript
// Types are inferred from route definitions
import type { AppRouter } from '@/server/router';
import { createApi } from '@spfn/core/client';

// Full type safety without codegen
const api = createApi<AppRouter>();

// Types inferred:
// api.getUser.call({ params: { id: string } }) → { id: string; name: string }
// api.createUser.call({ body: { name: string; email: string } }) → { id: string; ... }
```

## Step 2: Server Build

The Hono server is compiled from TypeScript to JavaScript with optimizations.

### TypeScript Compilation

```json
// Build configuration (tsconfig.server.json)
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "target": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist/server",
    "rootDir": "src",
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/server/**/*", "src/lib/**/*"],
  "exclude": ["src/app/**/*", "src/components/**/*"]
}
```

### Server Entry Generation

```typescript
// dist/server/index.js (generated)
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { registerRoutes } from '@spfn/core/route';
import serverConfig from './server.config.js';

const app = new Hono();

// Register all routes from router
registerRoutes(app, serverConfig.routes, {
    middlewares: serverConfig.middlewares,
});

// Start server
serve({
    fetch: app.fetch,
    port: process.env.PORT || 8790
});

console.log('Server running on http://localhost:8790');
```

### Build Output

```bash
dist/
└─ server/
   ├─ index.js              # Server entry point
   ├─ server.config.js      # Compiled config
   ├─ router.js             # Compiled router
   ├─ routes/
   │  ├─ users.js           # Route handlers
   │  ├─ teams.js
   │  └─ ...
   └─ middlewares/
      ├─ auth.js
      └─ logging.js
```

## Step 3: Next.js Build

Next.js frontend is built with optimizations for production.

### Next.js Build Process

```bash
# next build runs:
# 1. TypeScript type checking
# 2. Page compilation and optimization
# 3. Static generation (SSG) for eligible pages
# 4. Image optimization
# 5. Bundle splitting and tree shaking
# 6. CSS minification
# 7. Code splitting by route

# Build output
.next/
├─ static/
│  ├─ chunks/          # JavaScript bundles
│  └─ css/             # Stylesheets
├─ server/
│  ├─ app/             # App Router pages
│  └─ pages/           # Pages Router (if used)
└─ cache/              # Build cache
```

### API Client Integration

The type-safe API client imports types from your router:

```typescript
// Frontend page
import { api } from '@/lib/api';  // Type-safe client

export default async function UsersPage()
{
    // Type-safe API call
    const users = await api.getUsers.call({ query: { page: 1 } });

    return (
        <div>
            {users.items.map(user => (
                <div key={user.id}>{user.name}</div>
            ))}
        </div>
    );
}

// Next.js build optimizations:
// 1. Types are stripped (zero runtime cost)
// 2. Tree-shaking removes unused code
// 3. Code splitting per route
```

## Development vs Production

### Development Mode (spfn dev)

- **Hot reload** - Both Next.js and Hono server reload on changes
- **Source maps** - Full debugging support
- **No optimization** - Fast compilation, readable code
- **Watch mode** - Routes automatically re-register on changes
- **Error overlay** - Detailed error messages in browser

```bash
# spfn dev starts:
spfn dev
│
├─ Route watcher (re-register routes on change)
├─ Next.js dev server (port 3790)
├─ Hono dev server (port 8790)
└─ File watcher for routes

# When file changes:
File Change
├─ Route file change? → Re-register routes
├─ Server file change? → Reload Hono server
└─ Frontend change? → Next.js HMR
```

### Production Build (spfn build)

- **Optimized bundles** - Minification, tree-shaking, compression
- **Static generation** - Pre-render pages at build time
- **Image optimization** - WebP conversion, responsive images
- **Code splitting** - Separate bundles per route
- **No source maps** - Smaller bundle size (optional)

```bash
# spfn build output

Build Summary:
  Server Bundle     dist/server/        450 KB
  Next.js Build     .next/               2.8 MB

  Routes:           42 routes registered
  Build Time:       15.2s
```

## Build Optimizations

### 1. Incremental Builds

Superfunction caches build outputs for faster incremental builds:

```bash
# First build: 25s
# Second build (no changes): 3s
# Third build (1 file changed): 8s
```

### 2. Parallel Builds

Server and Next.js builds run in parallel:

```bash
# Sequential (slow): 45s total
Route registration  → 1s
Server build        → 12s
Next.js build       → 30s

# Parallel (fast): 31s total
Route registration  → 1s
  ├─ Server build   → 12s  (in parallel)
  └─ Next.js build  → 30s  (in parallel)

Total: 1s + max(12s, 30s) = 31s
```

### 3. Tree Shaking

Unused routes and handlers are eliminated:

```typescript
// Routes defined: 50
// Routes used by client: All (RPC-style)
// TypeScript types: Stripped at build time

// Before tree shaking: 150 KB
// After tree shaking:   80 KB (47% reduction)
```

## Build Configuration

### spfn.config.ts

```typescript
// spfn.config.ts
import { defineConfig } from 'spfn';

export default defineConfig({
    // Server build
    server: {
        entry: 'src/server/index.ts',
        output: 'dist/server',
        sourcemap: true,
        minify: process.env.NODE_ENV === 'production'
    },

    // Next.js integration
    nextjs: {
        dir: '.',
        experimental: {
            serverActions: true
        }
    }
});
```

### Server Config

```typescript
// src/server/server.config.ts
import { defineServerConfig } from '@spfn/core/server';
import { appRouter } from './router';
import { authMiddleware, loggingMiddleware } from './middlewares';

export default defineServerConfig()
    .port(8790)
    .middlewares([
        loggingMiddleware,
        authMiddleware,
    ])
    .routes(appRouter)
    .cors({
        origin: '*',
        credentials: true,
    })
    .build();
```

## Build Commands

| Command | Description |
|---------|-------------|
| `spfn dev` | Start dev servers with hot reload |
| `spfn build` | Build for production |
| `spfn start` | Start production servers |
| `spfn build --server-only` | Build server only (skip Next.js) |

## Build Performance

### Typical Build Times

| Project Size | Route Registration | Server Build | Next.js Build | Total |
|--------------|-------------------|--------------|---------------|-------|
| Small (10 routes) | <1s | 3s | 12s | 15s |
| Medium (50 routes) | <1s | 8s | 25s | 33s |
| Large (200 routes) | 1s | 18s | 45s | 64s |

*Times are approximate, measured on M1 MacBook Pro*

## Troubleshooting

### Slow Builds

```typescript
// 1. Enable build cache (default: enabled)
// spfn.config.ts
export default defineConfig({
    cache: {
        enabled: true,
        directory: '.spfn/cache'
    }
});

// 2. Use --server-only when frontend unchanged
spfn build --server-only

// 3. Check for circular dependencies
// Circular imports significantly slow down builds
```

### Build Errors

- **Route registration errors** - Check route definitions have valid paths and methods
- **TypeScript errors** - Run `tsc --noEmit` to see detailed errors
- **Import errors** - Verify imports use correct paths
- **Memory errors** - Increase Node.js memory: `NODE_OPTIONS=--max-old-space-size=4096`

### Common Issues

```typescript
// ❌ Invalid route path
export const badRoute = route.get('users/:id')  // Missing leading slash
    .handler(...);

// ✅ Valid route path
export const goodRoute = route.get('/users/:id')
    .handler(...);

// ❌ Missing handler
export const incomplete = route.get('/users')
    .input({ query: Type.Object({ page: Type.Number() }) });
    // No .handler() call

// ✅ Complete route
export const complete = route.get('/users')
    .input({ query: Type.Object({ page: Type.Number() }) })
    .handler(async (c) => { ... });
```