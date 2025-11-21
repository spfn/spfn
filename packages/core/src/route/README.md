# @spfn/core/route - Technical Documentation

Type-safe route definition system with tRPC-style API and comprehensive middleware control.

## Architecture Overview

The route system provides a declarative, type-safe way to define API routes with automatic validation, middleware management, and type inference. It follows a builder pattern inspired by tRPC.

### Core Components

```
route/
├── define-route.ts          # Route builder and types
├── register-routes.ts       # Hono integration layer
└── index.ts                # Public API exports
```

### Design Principles

1. **Type Safety First**: Full end-to-end type inference from route definition to handler
2. **Explicit Over Implicit**: No magic - all input sources (params, query, body, headers, cookies) are explicit
3. **Composability**: Routes, routers, and middleware are composable building blocks
4. **Framework Agnostic**: Core types are independent of Hono (though implementation uses it)

---

## Type System

### Core Types

```typescript
// Route input definition
export type RouteInput = {
    params?: TSchema;
    query?: TSchema;
    body?: TSchema;
    headers?: TSchema;
    cookies?: TSchema;
};

// Structured input after validation
type StructuredInput<TInput extends RouteInput> = {
    params: TInput['params'] extends TSchema ? Static<TInput['params']> : {};
    query: TInput['query'] extends TSchema ? Static<TInput['query']> : {};
    body: TInput['body'] extends TSchema ? Static<TInput['body']> : {};
    headers: TInput['headers'] extends TSchema ? Static<TInput['headers']> : {};
    cookies: TInput['cookies'] extends TSchema ? Static<TInput['cookies']> : {};
};

// Route definition result
export type RouteDef<TInput extends RouteInput = RouteInput, TResponse = any> = {
    method?: HttpMethod;
    path?: string;
    input?: TInput;
    middlewares?: MiddlewareHandler[];
    skipMiddlewares?: string[] | '*';
    handler: RouteHandlerFn<TInput, TResponse>;

    // Type inference helpers
    _input: TInput;
    _response: TResponse;
};

// Router composition
export type Router<TRoutes extends Record<string, RouteDef<any, any> | Router<any>>> = {
    routes: TRoutes;
    _routes: TRoutes;  // Type inference helper
};
```

### Type Inference Flow

```typescript
// 1. Input definition with TypeBox schemas
const input = {
    params: Type.Object({ id: Type.String() }),
    query: Type.Object({ page: Type.Number() })
};

// 2. Type inference at compile time
type InferredInput = StructuredInput<typeof input>;
// Result: {
//   params: { id: string },
//   query: { page: number },
//   body: {},
//   headers: {},
//   cookies: {}
// }

// 3. Handler receives typed context
route.get('/users/:id')
    .input(input)
    .handler(async (c) => {
        const { params, query } = await c.data();
        // params: { id: string }
        // query: { page: number }
    });
```

---

## Builder Pattern Implementation

### RouteBuilder Class

The `RouteBuilder` implements a fluent API for route construction:

```typescript
export class RouteBuilder<TInput extends RouteInput = {}, TResponse = never> {
    public _method?: HttpMethod;
    public _path?: string;
    public _input?: TInput;
    public _middlewares?: MiddlewareHandler[];
    public _skipMiddlewares?: string[] | '*';

    // Chainable methods that return new builder instances
    input<TNewInput extends RouteInput>(input: TNewInput): RouteBuilder<TNewInput, TResponse>
    use(middlewares: MiddlewareHandler[]): RouteBuilder<TInput, TResponse>
    skip(middlewareNames: string[] | '*'): RouteBuilder<TInput, TResponse>

    // Terminal method that produces RouteDef
    handler<THandlerResponse>(fn: RouteHandlerFn<TInput, THandlerResponse>): RouteDef<TInput, THandlerResponse>
}
```

**Key Design Decisions:**

1. **Immutability**: Each chainable method returns a new `RouteBuilder` instance
2. **Type Preservation**: Generic parameters flow through the chain
3. **Terminal Handler**: `.handler()` is the only way to finalize a route
4. **No Method Overloading**: Single signature for each method reduces complexity

### Factory Functions

```typescript
function createMethodRoute(method: HttpMethod): (path: string) => RouteBuilder {
    return (path: string) => {
        const builder = new RouteBuilder();
        builder._method = method;
        builder._path = path;
        return builder;
    };
}

export const route = {
    get: createMethodRoute('GET'),
    post: createMethodRoute('POST'),
    put: createMethodRoute('PUT'),
    patch: createMethodRoute('PATCH'),
    delete: createMethodRoute('DELETE'),
};
```

---

## Validation System

### Input Validation Flow

```
HTTP Request
    ↓
Extract & Parse (params, query, body, headers, cookies)
    ↓
TypeBox Value.Convert() - Type coercion
    ↓
TypeBox Value.Errors() - Schema validation
    ↓
Throw ValidationError if errors exist
    ↓
Return StructuredInput<TInput>
```

### Implementation (register-routes.ts)

```typescript
async function createRouteBuilderContext<TInput extends RouteInput>(
    c: Context,
    input: TInput
): Promise<RouteBuilderContext<TInput>> {
    // 1. Validate params
    let params: Record<string, any> = {};
    if (input.params) {
        params = c.req.param();
        params = Value.Convert(input.params, params);

        const errors = [...Value.Errors(input.params, params)];
        if (errors.length > 0) {
            throw new ValidationError('Invalid path parameters', {
                fields: errors.map(e => ({
                    path: e.path,
                    message: e.message,
                    value: e.value,
                }))
            });
        }
    }

    // 2-5. Similar for query, body, headers, cookies
    // ...

    // 6. Return structured context
    return {
        data: async () => ({ params, query, body, headers, cookies }),
        json: (data, status, headers) => c.json(data, status, headers),
        success: (data, meta, status) => { /* ... */ },
        // ... other helpers
        raw: c
    };
}
```

**Validation Order:**
1. Path parameters (`:id`)
2. Query parameters (`?page=1`)
3. Request body (JSON)
4. Headers (`authorization`)
5. Cookies (`session`)

**Error Handling:**
- All validation errors throw `ValidationError`
- Errors include field path, message, and actual value
- Caught by global error handler middleware

---

## Response Patterns

### Direct Return (Recommended)

The simplest and most type-safe way to return data from handlers:

```typescript
export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) => {
        const { params } = await c.data();
        const user = await db.getUser(params.id);

        if (!user) {
            throw new Error('User not found');
        }

        // Direct return - perfect type inference!
        return {
            id: user.id,
            name: user.name,
            email: user.email
        };
    });

// Response body: { id: '123', name: 'John', email: 'john@example.com' }
// Client type: { id: string; name: string; email: string }
```

**Advantages:**
- ✅ Perfect TypeScript inference
- ✅ Clean, minimal code
- ✅ tRPC-style developer experience
- ✅ Automatic JSON serialization

**How it works:**
- Handler returns plain JavaScript object/array/primitive
- Framework automatically wraps with `c.json(result)`
- No response wrapper - client receives data directly

### Response Helpers (Optional)

For cases requiring custom status codes, headers, or response structure:

```typescript
export const createUser = route.post('/users')
    .input({ body: Type.Object({ name: Type.String() }) })
    .handler(async (c) => {
        const { body } = await c.data();
        const user = await db.createUser(body);

        // Created with Location header
        return c.created(user, `/users/${user.id}`);
        // Response: 201 Created
        // Header: Location: /users/123
    });

export const deleteUser = route.delete('/users/:id')
    .handler(async (c) => {
        await db.deleteUser((await c.data()).params.id);

        // No content
        return c.noContent();
        // Response: 204 No Content (empty body)
    });

export const updateUser = route.put('/users/:id')
    .handler(async (c) => {
        // Custom status code
        return c.json({ updated: true }, 202);
        // Response: 202 Accepted
    });
```

**Available Helpers:**
- `c.json(data, status?, headers?)` - Custom JSON response
- `c.created(data, location?)` - 201 with Location header
- `c.accepted(data?)` - 202 Accepted
- `c.noContent()` - 204 No Content
- `c.notModified()` - 304 Not Modified

**When to use helpers:**
- Need specific HTTP status codes (201, 202, 204, 304, etc.)
- Need custom headers (Location, Cache-Control, etc.)
- Legacy API requiring `{ success: true, data }` wrapper (use `c.success()`)

### Error Handling

Errors are handled by throwing:

```typescript
export const getUser = route.get('/users/:id')
    .handler(async (c) => {
        const user = await db.getUser((await c.data()).params.id);

        if (!user) {
            // Throw standard Error
            throw new Error('User not found');
            // Framework converts to proper error response
        }

        return user;
    });

// For custom error codes:
export const protectedRoute = route.get('/protected')
    .handler(async (c) => {
        const user = await authenticate(c);

        if (!user) {
            // Use ValidationError for 400-level errors
            throw new ValidationError('Authentication required', {
                fields: [{ path: '/auth', message: 'Missing token' }]
            });
        }

        return { data: 'protected' };
    });
```

---

## Middleware System

### Named Middleware Pattern

```typescript
// define-middleware.ts
export type NamedMiddleware<TName extends string = string> = {
    name: TName;
    handler: MiddlewareHandler;
    _name: TName;  // Type inference helper
};

export function defineMiddleware<TName extends string>(
    name: TName,
    handler: MiddlewareHandler
): NamedMiddleware<TName> {
    return { name, handler, _name: name as TName };
}
```

**Design Rationale:**
- `_name` field enables TypeScript literal type inference
- Type parameter `TName` captured for compile-time checking
- Name used for runtime middleware filtering

### Middleware Application Order

```
Request
    ↓
[Server-level named middlewares] (filtered by skipMiddlewares)
    ↓
[Route-level middlewares] (from .use())
    ↓
[Validation middleware] (automatic)
    ↓
Route handler
```

### Skip Control Implementation

```typescript
// In registerRoute()
function registerRoute(
    app: Hono,
    name: string,
    routeDef: RouteDef<any>,
    namedMiddlewares?: ReadonlyArray<{ name: string; handler: MiddlewareHandler }>
): void {
    const { skipMiddlewares } = routeDef;
    const skipAll = skipMiddlewares === '*';

    const allMiddlewares: MiddlewareHandler[] = [];

    // Add server-level middlewares (filtered)
    if (namedMiddlewares && !skipAll) {
        const skipSet = new Set(Array.isArray(skipMiddlewares) ? skipMiddlewares : []);
        for (const middleware of namedMiddlewares) {
            if (!skipSet.has(middleware.name)) {
                allMiddlewares.push(middleware.handler);
            }
        }
    }

    // Add route-level middlewares (never skipped)
    allMiddlewares.push(...middlewares);

    // Register to Hono
    app[methodLower](path, ...allMiddlewares, wrappedHandler);
}
```

**Skip Semantics:**
- `skip(['auth'])` - Skip specific named middlewares
- `skip('*')` - Skip all server-level middlewares
- Route-level middlewares (`.use()`) are never skipped
- Validation middleware is never skipped

---

## Router Composition

### defineRouter Implementation

```typescript
export function defineRouter<TRoutes extends Record<string, RouteDef<any, any> | Router<any>>>(
    routes: TRoutes
): Router<TRoutes> {
    return {
        routes,
        _routes: routes,  // Type inference helper
    };
}
```

**Usage Patterns:**

```typescript
// Pattern 1: Flat spread
export const appRouter = defineRouter({
    ...userRoutes,    // { getUser, createUser, updateUser }
    ...teamRoutes,    // { getTeam, createTeam, updateTeam }
});

// Pattern 2: Nested namespacing
export const appRouter = defineRouter({
    users: defineRouter(userRoutes),
    teams: defineRouter(teamRoutes),
});

// Pattern 3: Mixed
export const appRouter = defineRouter({
    ...publicRoutes,  // Flat spread
    admin: defineRouter(adminRoutes),  // Nested
});
```

### Type Guard Functions

```typescript
function isRouter(value: unknown): value is Router<any> {
    return value !== null &&
        typeof value === 'object' &&
        'routes' in value &&
        '_routes' in value;
}

function isRouteDef(value: unknown): value is RouteDef<any> {
    return value !== null &&
        typeof value === 'object' &&
        'handler' in value;
}
```

**Recursive Registration:**

```typescript
export function registerRoutes<TRoutes>(
    app: Hono,
    router: Router<TRoutes>,
    namedMiddlewares?: ReadonlyArray<NamedMiddleware<any>>
): void {
    for (const [name, routeOrRouter] of Object.entries(router.routes)) {
        if (isRouter(routeOrRouter)) {
            // Nested router - recurse
            registerRoutes(app, routeOrRouter, namedMiddlewares);
        } else if (isRouteDef(routeOrRouter)) {
            // Single route - register
            registerRoute(app, name, routeOrRouter, namedMiddlewares);
        }
    }
}
```

---

## Server Integration

### Config Builder Pattern

```typescript
// server/config-builder.ts
export class ServerConfigBuilder {
    private config: ServerConfig = {};

    routes(router: Router<any>): this {
        this.config.routes = router;
        return this;
    }

    middlewares(middlewares: readonly NamedMiddleware<any>[]): this {
        this.config.middlewares = middlewares;
        return this;
    }

    build(): ServerConfig {
        return this.config;
    }
}

export function defineServerConfig(): ServerConfigBuilder {
    return new ServerConfigBuilder();
}
```

### Automatic Registration

```typescript
// server/create-server.ts
async function loadAppRoutes(app: Hono, config?: ServerConfig): Promise<void> {
    // Register define-route routes (if provided)
    if (config?.routes) {
        registerRoutes(app, config.routes, config.middlewares);
    }
}
```

---

## Context API

### RouteBuilderContext

```typescript
export type RouteBuilderContext<TInput extends RouteInput = RouteInput> = {
    // Structured input accessor
    data(): Promise<StructuredInput<TInput>>;

    // Response helpers
    json(data: any, status?: ContentfulStatusCode, headers?: Record<string, string | string[]>): Response;
    success(data: any, meta?: any, status?: ContentfulStatusCode): Response;
    created(data: any, location?: string): Response;
    accepted(data?: any): Response;
    noContent(): Response;
    notModified(): Response;
    paginated(data: any[], page: number, limit: number, total: number): Response;

    // Raw Hono context
    raw: Context;
};
```

**Design Decisions:**

1. **Async data()**: Returns Promise to support async body parsing
2. **Structured Return**: Returns object with separate fields (not merged)
3. **Response Helpers**: Convenience methods for common patterns
4. **Raw Access**: Escape hatch for advanced Hono features

### Response Helper Implementation

```typescript
success: (data, meta, status = 200) => {
    const response: ApiSuccessResponse<typeof data> = {
        success: true,
        data,
    };

    if (meta) {
        response.meta = meta;
    }

    return c.json(response, status);
},

paginated: (data, page, limit, total) => {
    const response: ApiSuccessResponse<typeof data> = {
        success: true,
        data,
        meta: {
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        },
    };

    return c.json(response, 200);
},
```

---

## Extension Points

### Custom Response Helpers

Add custom helpers by extending `RouteBuilderContext`:

```typescript
// Extend the context type
declare module '@spfn/core/route' {
    interface RouteBuilderContext {
        customHelper(data: any): Response;
    }
}

// Implement in createRouteBuilderContext()
return {
    // ... existing helpers
    customHelper: (data) => {
        return c.json({ custom: true, data });
    },
    raw: c
};
```

### Custom Validation

Extend TypeBox schemas with custom formats:

```typescript
import { FormatRegistry } from '@sinclair/typebox';

// Register custom format
FormatRegistry.Set('slug', (value) => /^[a-z0-9-]+$/.test(value));

// Use in schema
const input = {
    params: Type.Object({
        slug: Type.String({ format: 'slug' })
    })
};
```

### Custom Middleware

Named middlewares enable type-safe skip control:

```typescript
// Define middleware
export const customMiddleware = defineMiddleware('custom', async (c, next) => {
    // middleware logic
    await next();
});

// Register globally
const config = defineServerConfig()
    .middlewares([customMiddleware])
    .build();

// Skip in specific routes
route.get('/public')
    .skip(['custom'])
    .handler(async (c) => { ... });
```

---

## Performance Considerations

### Type Inference Cost

- Type inference happens at compile time (zero runtime cost)
- `_input` and `_response` fields are never accessed at runtime
- Only used by TypeScript for type checking

### Validation Cost

- TypeBox validation is fast (~1-2ms for typical schemas)
- Value.Convert() minimizes overhead with in-place modifications
- Errors array is lazy (only created on validation failure)

### Middleware Overhead

- Skip check is O(n) where n = number of named middlewares (typically < 10)
- Set lookup is O(1) for skip checking
- Wildcard check is O(1)

### Memory Usage

- Each route creates one `RouteBuilder` instance per chain
- Intermediate builders are garbage collected immediately
- Final `RouteDef` is retained in router

---

## Testing Strategy

### Unit Tests

Test individual components in isolation:

```typescript
// Test route builder
it('should chain methods correctly', () => {
    const route = route.get('/users/:id')
        .input({ params: Type.Object({ id: Type.String() }) })
        .handler(async (c) => c.json({ id: c.params.id }));

    expect(route.method).toBe('GET');
    expect(route.path).toBe('/users/:id');
    expect(route.input).toBeDefined();
});

// Test validation
it('should validate params correctly', async () => {
    const input = { params: Type.Object({ id: Type.Integer() }) };
    const context = await createRouteBuilderContext(mockContext, input);

    // Should throw ValidationError for invalid input
});
```

### Integration Tests

Test full request/response cycle:

```typescript
it('should handle request end-to-end', async () => {
    const getUser = route.get('/users/:id')
        .input({ params: Type.Object({ id: Type.String() }) })
        .handler(async (c) => {
            const { params } = await c.data();
            return { id: params.id, name: 'John' };
        });

    const router = defineRouter({ getUser });
    const app = await createServer(defineServerConfig().routes(router).build());

    const res = await app.request('/users/123');
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ id: '123', name: 'John' });
});
```

---

## Future Enhancements

### Potential Improvements

1. **Streaming Responses**: Support streaming for large payloads
2. **WebSocket Support**: Add `.ws()` method for WebSocket routes
3. **OpenAPI Generation**: Generate OpenAPI specs from route definitions
4. **Client Generation**: Auto-generate type-safe API clients
5. **Rate Limiting**: Built-in rate limiting with `.rateLimit()` method

### Breaking Changes Planned

- Remove contract-based routing system (replaced by define-route)
- Remove file-based auto-loader system (use explicit import instead)

---

## Related Systems

### Comparison with Contract-Based Routing

| Feature | define-route | contract-based |
|---------|-------------|----------------|
| Type Safety | ✅ Full | ✅ Full |
| Middleware Control | ✅ skip() method | ✅ meta.skipMiddlewares |
| Input Separation | ✅ Explicit | ❌ Merged |
| Builder Pattern | ✅ Yes | ❌ No |
| Response Helpers | ✅ Built-in | ✅ Built-in |
| **Status** | **Active** | **Deprecated** |

### Integration with Other Modules

- **@spfn/core/errors**: ValidationError, HttpError classes
- **@spfn/core/logger**: Route registration logging
- **@spfn/core/server**: Server configuration and startup

---

## References

- [TypeBox](https://github.com/sinclairzx81/typebox) - Schema validation
- [Hono](https://hono.dev) - Web framework
- [tRPC](https://trpc.io) - Inspiration for builder pattern