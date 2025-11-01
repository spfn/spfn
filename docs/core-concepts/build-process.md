---
title: "Build Process"
description: "Understand how Superfunction builds and transforms your application for production"
order: 7
available: true
---

# Build Process

Superfunction's build process orchestrates Next.js and Hono server builds, generates type-safe client code, and optimizes your application for production deployment.

## Build Architecture

```bash
spfn build
│
├─ Step 1: Contract Code Generation
│  └─ Output: src/lib/api/ (Generated client)
│
├─ Step 2: Server Build
│  └─ Output: dist/server/ (Compiled Hono server)
│
└─ Step 3: Next.js Build
   └─ Output: .next/ (Optimized frontend)
```

## Step 1: Contract Code Generation

Superfunction scans all contracts in `src/lib/contracts/` and generates a type-safe API client with resource-based file splitting in `src/lib/api/`.

### Contract Discovery

```typescript
// 1. Scan contracts directory
const contractFiles = await glob('src/lib/contracts/**/*.{ts,js}');
// Result: ['src/lib/contracts/users.ts', 'src/lib/contracts/posts.ts', ...]

// 2. Import and extract contracts
for (const file of contractFiles) {
  const module = await import(file);

  // Find all exported RouteContracts
  for (const [name, value] of Object.entries(module)) {
    if (isRouteContract(value)) {
      contracts.push({
        name,
        contract: value,
        path: value.path,
        method: value.method
      });
    }
  }
}

// 3. Group by resource
// /users/:id     → users.get
// /users         → users.list
// POST /users    → users.create
```

### Client Code Generation

```typescript
// Input: Contract definitions
export const getUserContract = {
  method: 'GET',
  path: '/users/:id',
  params: Type.Object({ id: Type.Integer() }),
  response: Type.Object({
    id: Type.Number(),
    name: Type.String(),
    email: Type.String()
  })
} satisfies RouteContract;

// Output: Generated API client (src/lib/api/users.ts)
import { client } from '@spfn/core/client';
import type { InferContract } from '@spfn/core';
import { getUserContract } from '@/lib/contracts/users';

// Reusable types
export type GetUserParams = InferContract<typeof getUserContract>['params'];
export type GetUserResponse = InferContract<typeof getUserContract>['response'];

// API methods
export const users = {
  get: (options: { params: GetUserParams }) =>
    client.call(getUserContract, options)
} as const;

// Usage in frontend (fully type-safe!)
import { api } from '@/lib/api';
const user = await api.users.get({ params: { id: 123 } });
//    ^? { id: number; name: string; email: string }
```

### Generated Client Features

- **Type inference** - Parameters and responses are fully typed
- **Error handling** - Automatic HTTP error detection
- **Path interpolation** - Dynamic URL generation from params
- **Query string building** - Automatic query param serialization
- **JSON serialization** - Automatic request/response parsing

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

// Compilation process
// 1. TypeScript compiler (tsc)
//    src/server/ → dist/server/
// 2. Bundle routes
//    dist/server/routes/*.js
// 3. Generate server entry
//    dist/server/index.js
```

### Route Discovery at Build Time

```typescript
// Build-time route discovery
const routeFiles = await glob('src/server/routes/**/*.{ts,js}');

// Generate server entry point
const entryCode = `
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();

// Import all route modules
${routeFiles.map((file, i) =>
  `import route${i} from '${file}';`
).join('\n')}

// Mount all routes
${routeFiles.map((file, i) =>
  `app.route('/', route${i});`
).join('\n')}

// Start server
serve({
  fetch: app.fetch,
  port: process.env.PORT || 8790
});

console.log('🚀 Server running on http://localhost:8790');
`;

await writeFile('dist/server/index.js', entryCode);
```

### Build Output

```bash
dist/
└─ server/
   ├─ index.js              # Server entry point
   ├─ routes/
   │  ├─ users.js           # Compiled user routes
   │  ├─ posts.js           # Compiled post routes
   │  └─ ...
   ├─ middleware/
   │  ├─ auth.js
   │  └─ logger.js
   └─ lib/
      └─ contracts/
         ├─ users.js
         └─ posts.js
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

The generated API client (`src/lib/api/`) is imported and tree-shaken by Next.js:

```typescript
// Frontend page
import { api } from '@/lib/api';  // Generated client

export default async function UsersPage() {
  // Type-safe API call
  const users = await api.users.list();

  return (
    <div>
      {users.map(user => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
}

// Next.js build optimizations:
// 1. Only used API methods are bundled
// 2. Tree-shaking removes unused contracts
// 3. Code splitting per route
// 4. TypeScript types stripped (zero runtime cost)
```

## Development vs Production

### Development Mode (spfn dev)

- **Hot reload** - Both Next.js and Hono server reload on changes
- **Source maps** - Full debugging support
- **No optimization** - Fast compilation, readable code
- **Watch mode** - Auto-regenerate API client on contract changes
- **Error overlay** - Detailed error messages in browser

```bash
# spfn dev starts:
spfn dev
│
├─ Contract watcher (regenerate API client on change)
├─ Next.js dev server (port 3790)
├─ Hono dev server (port 8790)
└─ File watcher for routes

# When file changes:
File Change
├─ Contract change? → Regenerate API client
├─ Route change? → Reload Hono server
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
  API Client        src/lib/api/        25 KB
  Server Bundle     dist/server/        450 KB
  Next.js Build     .next/               2.8 MB

  Routes:           42 routes discovered
  Contracts:        38 contracts processed
  Pages:            12 pages generated
  Build Time:       18.3s
```

## Build Optimizations

### 1. Contract Caching

Superfunction caches contract parsing to speed up builds:

```json
// .spfn/cache/contracts.json
{
  "version": "1.0.0",
  "timestamp": "2025-01-15T10:30:00Z",
  "contracts": [
    {
      "file": "src/lib/contracts/users.ts",
      "hash": "a1b2c3d4",
      "exports": ["getUserContract", "createUserContract"],
      "lastModified": "2025-01-15T10:25:00Z"
    }
  ]
}

// Build process checks cache:
// 1. Compare file hash
// 2. Skip if unchanged
// 3. Only regenerate modified contracts
// Result: 5-10x faster incremental builds
```

### 2. Parallel Builds

Server and Next.js builds run in parallel:

```bash
# Sequential (slow): 45s total
Contract generation → 3s
Server build        → 12s
Next.js build       → 30s

# Parallel (fast): 33s total
Contract generation → 3s
  ├─ Server build   → 12s  (in parallel)
  └─ Next.js build  → 30s  (in parallel)

Total: 3s + max(12s, 30s) = 33s
```

### 3. Tree Shaking

Unused contracts and routes are eliminated:

```typescript
// Contracts defined: 50
// Contracts used in frontend: 12
// Result: Only 12 contracts bundled

// Before tree shaking: 150 KB
// After tree shaking:   35 KB (77% reduction)
```

## Build Configuration

### spfn.config.ts

```typescript
// spfn.config.ts
import { defineConfig } from 'spfn';

export default defineConfig({
  // Contract generation
  contracts: {
    input: 'src/lib/contracts',
    output: 'src/lib/api',  // Directory, not file
    watch: true,  // Auto-regenerate in dev mode
    incremental: true  // Smart regeneration (skip if only formatting changed)
  },

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

## Build Commands

| Command | Description |
|---------|-------------|
| `spfn dev` | Start dev servers with hot reload |
| `spfn build` | Build for production |
| `spfn start` | Start production servers |
| `spfn codegen` | Regenerate API client only |
| `spfn build --server-only` | Build server only (skip Next.js) |

## Build Performance

### Typical Build Times

| Project Size | Contract Gen | Server Build | Next.js Build | Total |
|--------------|--------------|--------------|---------------|-------|
| Small (10 routes) | 1s | 3s | 12s | 16s |
| Medium (50 routes) | 3s | 8s | 25s | 36s |
| Large (200 routes) | 8s | 18s | 45s | 71s |

*Times are approximate, measured on M1 MacBook Pro*

## Troubleshooting

### Slow Builds

```bash
// 1. Enable build cache
// spfn.config.ts
export default defineConfig({
  cache: {
    enabled: true,
    directory: '.spfn/cache'
  }
});

// 2. Use --server-only when frontend unchanged
spfn build --server-only

// 3. Incremental builds (dev mode)
spfn dev --no-clear  // Keep cache between restarts
```

### Build Errors

- **Contract validation errors** - Check contract syntax, ensure all required fields present
- **TypeScript errors** - Run `tsc --noEmit` to see detailed errors
- **Import errors** - Verify contract imports use correct paths
- **Memory errors** - Increase Node.js memory: `NODE_OPTIONS=--max-old-space-size=4096`
