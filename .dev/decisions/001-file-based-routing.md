# 001. File-based Routing System

**Date:** 2025-01-15
**Status:** Accepted
**Deciders:** SPFN Core Team

## Context

We needed to decide on a routing system for the backend API. The main question was: should we use a traditional router (like Express/Hono style) or implement file-based routing similar to Next.js?

## Decision

We chose to implement **file-based routing** similar to Next.js App Router for the backend API.

## Implementation

```
src/server/routes/
├── users/
│   ├── index.ts          → GET/POST /api/users
│   ├── [id].ts          → GET/PUT/DELETE /api/users/:id
│   └── [id]/
│       └── posts.ts     → GET /api/users/:id/posts
```

Files export HTTP method handlers:

```typescript
export async function GET(c: RouteContext) { }
export async function POST(c: RouteContext) { }
export const middlewares = [Transactional()];
```

## Consequences

### Positive

- **Developer Experience**: Familiar pattern for Next.js developers
- **Auto-discovery**: Routes are automatically discovered and registered
- **Colocation**: Route logic, middleware, and metadata in one file
- **Type Safety**: Route structure maps directly to URL structure
- **Scalability**: Easy to organize large applications
- **Convention over Configuration**: Minimal boilerplate

### Negative

- **Learning Curve**: Developers from Express/NestJS need to adapt
- **File System Overhead**: Extra file I/O for route discovery (mitigated by caching)
- **Less Explicit**: Routes aren't centrally defined in one file
- **Build Complexity**: Requires custom route scanner implementation

## Alternatives Considered

### 1. Traditional Router (Express/Hono style)

```typescript
app.get('/api/users', handler);
app.post('/api/users', handler);
app.get('/api/users/:id', handler);
```

**Rejected because:**
- More boilerplate
- Routes scattered across files
- Harder to maintain in large apps
- Requires manual registration

### 2. Decorator-based (NestJS style)

```typescript
@Controller('users')
export class UsersController {
  @Get()
  findAll() { }

  @Post()
  create() { }
}
```

**Rejected because:**
- Requires TypeScript decorators (experimental)
- Class-based (we prefer functional)
- More complex DI system
- Less Next.js alignment

### 3. Code-first (tRPC style)

```typescript
const router = t.router({
  users: {
    list: t.procedure.query(() => { }),
    create: t.procedure.mutation(() => { })
  }
});
```

**Rejected because:**
- Ties us to specific RPC pattern
- Less RESTful
- Harder to integrate with standard HTTP tools
- Different mental model from Next.js

## Performance Considerations

- Route discovery happens once at startup (or on file change in dev)
- Routes are cached in memory via RouteRegistry
- No runtime performance penalty vs. manual routing
- File watching adds ~50ms to hot reload (acceptable for DX)

## Migration Path

If we need to move away from file-based routing:
1. Export routes programmatically: `getRoutes()` function
2. Generate traditional router config from file structure
3. Gradual migration with both systems side-by-side

## References

- [Next.js App Router Routing](https://nextjs.org/docs/app/building-your-application/routing)
- [Remix File-based Routing](https://remix.run/docs/en/main/discussion/routes)
- [SvelteKit Routing](https://kit.svelte.dev/docs/routing)
- [Route Module Implementation](../../packages/core/src/route/README.md)

## Related Decisions

- [002. Transaction Management](./002-transaction-management.md)
- [003. Client-Key Authentication](./003-client-key-auth.md)