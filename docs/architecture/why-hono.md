---
title: "Why Hono?"
description: "Learn why SPFN chose Hono as its underlying web framework"
order: 3
available: true
---

# Why Hono?

SPFN is built on top of Hono, a fast, lightweight web framework that works across multiple JavaScript runtimes. This choice enables SPFN to be performant, flexible, and future-proof.

## What is Hono?

Hono is a small, fast web framework designed to work on any JavaScript runtime including:

- **Node.js** - Traditional server runtime
- **Cloudflare Workers** - Edge computing platform
- **Deno** - Modern JavaScript/TypeScript runtime
- **Bun** - Fast all-in-one JavaScript runtime
- **Vercel Edge Functions** - Edge runtime on Vercel
- **AWS Lambda** - Serverless functions

## Key Reasons for Choosing Hono

### 1. Performance

Hono is one of the fastest JavaScript web frameworks, competing with low-level solutions.

#### Benchmark: Requests per Second (Node.js)

| Framework | Req/sec | Latency (avg) | Relative |
|-----------|---------|---------------|----------|
| **Hono** | 78,000 | 1.2ms | **1.0x** |
| Fastify | 72,000 | 1.3ms | 0.92x |
| Express | 28,000 | 3.5ms | 0.36x |
| Koa | 32,000 | 3.1ms | 0.41x |
| Next.js API Routes | 12,000 | 8.2ms | 0.15x |

*Benchmark: Simple JSON response, Node.js 20, M1 MacBook Pro*

> **Note:** Why Hono is Fast
>
> - **Optimized router** - RegExpRouter with O(1) lookup for most routes
> - **Zero dependencies** - No external packages to slow things down
> - **Minimal overhead** - Thin abstraction over native Web APIs
> - **Tree-shakeable** - Only bundle what you use

### 2. Web Standard APIs

Hono uses standard Web APIs (Request, Response, Headers), making it compatible with modern JavaScript runtimes.

```typescript
// Hono uses Web Standard APIs
app.get('/users/:id', (c) => {
  // c.req is built on standard Request
  const url = new URL(c.req.url);
  const headers = c.req.headers;  // Standard Headers object

  // Return standard Response
  return new Response(
    JSON.stringify({ id: 123, name: 'John' }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
});

// Compare with Express (Node.js-specific)
app.get('/users/:id', (req, res) => {
  // req/res are Node.js-specific objects
  res.status(200).json({ id: 123, name: 'John' });
});
```

Benefits of Web Standard APIs:

- **Runtime portability** - Same code works on Node.js, Deno, Bun, Cloudflare Workers
- **Future-proof** - Standards-based APIs evolve with the web platform
- **Familiar** - Same APIs used in browser fetch(), service workers
- **Testing** - Easy to test with standard Request/Response mocks

### 3. Edge Runtime Support

Hono works seamlessly on edge runtimes, enabling global deployment with low latency.

```typescript
// Same code works everywhere!

// Node.js
import { serve } from '@hono/node-server';
serve(app);

// Cloudflare Workers
export default app;

// Deno
Deno.serve(app.fetch);

// Bun
export default {
  port: 3000,
  fetch: app.fetch,
};

// Vercel Edge Functions
export const config = { runtime: 'edge' };
export default app;
```

### 4. Lightweight & Zero Dependencies

Hono has no dependencies, resulting in minimal bundle size and fast cold starts.

| Framework | Size (minified) | Dependencies | Cold Start |
|-----------|-----------------|--------------|------------|
| **Hono** | 37 KB | 0 | ~5ms |
| Fastify | ~500 KB | 45+ | ~50ms |
| Express | ~800 KB | 51+ | ~80ms |
| Next.js | ~2 MB | 200+ | ~200ms |

*Cold start measured on serverless/edge environments*

### 5. Middleware System

Hono has a powerful, composable middleware system similar to Express but more type-safe.

```typescript
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';

const app = new Hono();

// Global middlewares
app.use('*', logger());
app.use('*', cors());

// Route-specific middleware
app.use('/admin/*', async (c, next) => {
  const token = c.req.header('Authorization');
  if (!token) return c.text('Unauthorized', 401);
  await next();
});

// Middleware composition
const authMiddleware = async (c, next) => {
  c.set('user', await getUser(c));
  await next();
};

app.use('/api/*', authMiddleware);

// Route handlers can access middleware data
app.get('/api/profile', (c) => {
  const user = c.get('user');  // Set by middleware
  return c.json(user);
});
```

### 6. Built-in Utilities

Hono includes many useful utilities out of the box.

```typescript
// JSON response
app.get('/users', (c) => c.json({ users: [...] }));

// Text response
app.get('/health', (c) => c.text('OK'));

// HTML response
app.get('/', (c) => c.html('<h1>Hello</h1>'));

// Redirect
app.get('/old', (c) => c.redirect('/new'));

// Set headers
app.get('/api', (c) => {
  c.header('X-Custom', 'value');
  return c.json({ data: 'ok' });
});

// Parse request body
app.post('/users', async (c) => {
  const body = await c.req.json();
  return c.json(body);
});

// Get path params
app.get('/users/:id', (c) => {
  const id = c.req.param('id');
  return c.json({ id });
});

// Get query params
app.get('/search', (c) => {
  const q = c.req.query('q');
  return c.json({ query: q });
});
```

## Comparison with Other Frameworks

### Hono vs Express

| Feature | Hono | Express |
|---------|------|---------|
| Performance | ✓✓✓ Excellent | △ Moderate |
| Bundle Size | ✓ 37 KB | ✗ 800 KB |
| TypeScript Support | ✓ First-class | △ Via @types |
| Edge Runtime | ✓ Yes | ✗ No |
| Web Standards | ✓ Yes | ✗ Node.js only |
| Middleware Ecosystem | △ Growing | ✓✓ Huge |
| Learning Curve | ✓ Easy | ✓ Easy |

### Hono vs Fastify

| Feature | Hono | Fastify |
|---------|------|---------|
| Performance | ✓✓✓ Excellent | ✓✓ Very Good |
| Edge Runtime | ✓ Yes | ✗ No |
| Bundle Size | ✓ 37 KB | △ 500 KB |
| Schema Validation | △ Bring your own | ✓ Built-in (Ajv) |
| Plugin System | △ Middleware-based | ✓ Comprehensive |
| Runtime Portability | ✓ Multi-runtime | △ Node.js only |

## How SPFN Extends Hono

SPFN builds on top of Hono to add contract-based routing and type safety:

```typescript
// Pure Hono (no type safety)
app.get('/users/:id', async (c) => {
  const id = c.req.param('id');  // Type: string (no validation)
  const user = await db.users.findById(id);
  return c.json(user);  // No response type checking
});

// SPFN (contract-based, type-safe)
import { createApp } from 'spfn';
import { getUserContract } from '@/lib/contracts/users';

const app = createApp();

app.bind(getUserContract, async (c) => {
  const { id } = c.params;  // Type: number (validated + converted)
  const user = await db.users.findById(id);
  return c.json(user);  // Response type-checked against contract
});

// SPFN adds:
// 1. Contract-based routing
// 2. Automatic validation (TypeBox)
// 3. Type inference (InferContract)
// 4. Type-safe context (RouteContext<T>)
// 5. Client code generation
```

## Real-world Benefits

### Deployment Flexibility

Because SPFN uses Hono, you can deploy the same codebase to multiple platforms:

- **Traditional servers** - Deploy to VPS, EC2, Docker containers
- **Serverless** - AWS Lambda, Google Cloud Functions, Azure Functions
- **Edge** - Cloudflare Workers, Vercel Edge, Deno Deploy
- **Local development** - Run on Node.js, Bun, or Deno

### Global Low-Latency APIs

Deploy to edge locations worldwide for minimal latency:

| User Location | Traditional Server | Edge (Hono) |
|---------------|-------------------|-------------|
| US West | 15ms | 8ms |
| Europe | 120ms | 12ms |
| Asia | 250ms | 18ms |
| Australia | 180ms | 15ms |

*Latency from user to API server (single data center vs edge deployment)*

## When Other Frameworks Might Be Better

### Express

- **Huge ecosystem** - Thousands of middleware packages
- **Team familiarity** - Most developers know Express
- **Legacy integrations** - Existing Express middleware

### Fastify

- **Built-in validation** - JSON Schema validation included
- **Plugin system** - More structured than middleware
- **Mature ecosystem** - Many official and community plugins

## Conclusion

Hono was chosen as SPFN's foundation because:

1. **Performance** - One of the fastest JavaScript frameworks
2. **Standards-based** - Uses Web Standard APIs for portability
3. **Multi-runtime** - Works on Node.js, Deno, Bun, edge runtimes
4. **Lightweight** - Zero dependencies, 37 KB bundle
5. **Modern** - TypeScript-first with excellent DX
6. **Future-proof** - Built on web standards, not platform-specific APIs

By building on Hono, SPFN inherits these benefits while adding contract-based routing, automatic validation, and end-to-end type safety.

> **✅ Success:** Next: Build Process
>
> Learn how SPFN's build system transforms your code for production.
>
> [Build Process →](/docs/architecture/build-process)