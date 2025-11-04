# @spfn/core/route - Contract-based Routing System

Type-safe, contract-based routing with automatic route discovery.

## Features

- ✅ **Contract-based Routing**: TypeBox schemas for end-to-end type safety
- ✅ **Absolute Path Contracts**: Contracts define their own URL paths
- ✅ **Separation of Concerns**: Contracts in `lib/`, handlers in `server/routes/`
- ✅ **Frontend Sharing**: Contracts accessible from frontend code
- ✅ **Automatic Discovery**: Server automatically loads route handlers
- ✅ **Runtime Middleware Skip**: Method-level middleware control via contract.meta
- ✅ **Query Arrays**: Support for `?tags=a&tags=b` → `{ tags: ['a', 'b'] }`
- ✅ **Unified Error Handling**: All validation errors throw `ValidationError`
- ✅ **Zero Config**: Works out of the box

---

## Quick Start

### 1. Define Contracts (Frontend-shareable)

Contracts **must** be in `src/lib/contracts/` to be shared with frontend:

```typescript
// src/lib/contracts/teams.ts
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

/**
 * GET /teams - List all teams
 */
export const getTeamsContract = {
    method: 'GET' as const,
    path: '/teams',  // ← Absolute path!
    response: Type.Object({
        teams: Type.Array(Type.Object({
            id: Type.Number(),
            name: Type.String(),
            slug: Type.String()
        })),
        total: Type.Number()
    })
} as const satisfies RouteContract;

/**
 * GET /teams/:id - Get single team
 */
export const getTeamContract = {
    method: 'GET' as const,
    path: '/teams/:id',  // ← Absolute path with param!
    params: Type.Object({
        id: Type.Integer()  // Auto-converts string to number
    }),
    response: Type.Object({
        id: Type.Number(),
        name: Type.String(),
        slug: Type.String()
    })
} as const satisfies RouteContract;

/**
 * POST /teams - Create team
 */
export const createTeamContract = {
    method: 'POST' as const,
    path: '/teams',
    body: Type.Object({
        name: Type.String(),
        slug: Type.String()
    }),
    response: Type.Object({
        id: Type.Number(),
        name: Type.String(),
        slug: Type.String()
    })
} as const satisfies RouteContract;
```

### 2. Implement Handlers (Server-only)

Handlers can be organized anywhere in `src/server/routes/`:

```typescript
// src/server/routes/teams.ts
import { createApp } from '@spfn/core/route';
import {
    getTeamsContract,
    getTeamContract,
    createTeamContract
} from '../../lib/contracts/teams.js';  // ← Import from lib/

const app = createApp();

// GET /teams
app.bind(getTeamsContract, async (c) => {
    const teams = await db.select().from(teamsTable);
    return c.json({
        teams,
        total: teams.length
    });
});

// GET /teams/:id
app.bind(getTeamContract, async (c) => {
    const { id } = c.params;  // Typed as number
    const team = await db.select().from(teamsTable).where(eq(teamsTable.id, id));

    if (!team) {
        throw new NotFoundError('Team not found');
    }

    return c.json(team);
});

// POST /teams
app.bind(createTeamContract, async (c) => {
    const data = await c.data();  // Validated!
    const [newTeam] = await db.insert(teamsTable).values(data).returning();
    return c.json(newTeam);
});

export default app;
```

### 3. Server Automatically Loads Routes

```typescript
// src/server/server.ts or server.config.ts
import { startServer } from '@spfn/core';

await startServer({
    port: 4000,
    debug: true
});

// ✅ Routes automatically discovered and registered from src/server/routes/
// ✅ Contracts must be in src/lib/contracts/ with absolute paths
```

### 4. Use in Frontend (Type-safe!)

```typescript
// src/app/teams/page.tsx
import { api } from '@/lib/api';  // Auto-generated client

export default async function TeamsPage() {
    // ✅ Fully type-safe!
    const { teams, total } = await api.teams.list();

    return (
        <div>
            <h1>Teams ({total})</h1>
            {teams.map(team => (
                <div key={team.id}>{team.name}</div>
            ))}
        </div>
    );
}
```

---

## Architecture

### File Structure

```
src/
├── lib/
│   └── contracts/           # ← Contracts (REQUIRED location)
│       ├── teams.ts         # Team contracts
│       ├── users.ts         # User contracts
│       └── posts.ts         # Post contracts
│
├── server/
│   └── routes/              # ← Handlers (flexible organization)
│       ├── teams.ts         # All team handlers
│       ├── users/
│       │   ├── index.ts     # User list/create handlers
│       │   └── profile.ts   # User profile handlers
│       └── posts.ts         # Post handlers
│
└── app/                     # ← Frontend (can import contracts!)
    └── teams/
        └── page.tsx         # Uses api.teams.list()
```

### Key Principles

1. **Contracts Location**: **MUST** be in `src/lib/contracts/`
   - Reason: Shared with frontend for type-safe API calls
   - Scanned by codegen to generate `src/lib/api.ts`

2. **Handler Location**: Can be anywhere in `src/server/routes/`
   - Flexible file organization
   - Import contracts from `../../lib/contracts/`

3. **Absolute Paths**: Contracts always use absolute paths
   - ✅ `path: '/teams'`
   - ✅ `path: '/teams/:id'`
   - ❌ `path: '/'` (relative - DON'T USE)
   - ❌ `path: '/:id'` (relative - DON'T USE)

4. **File Structure ≠ URL Structure**
   - File location doesn't affect URLs
   - URLs are defined by `contract.path`
   - Organize files however you want!

---

## Contract Definition

### Required Fields

```typescript
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

const contract = {
    // ✅ Required: HTTP method
    method: 'POST' as const,

    // ✅ Required: Absolute URL path
    path: '/teams/:id',

    // ✅ Required: Response schema
    response: Type.Object({
        id: Type.Number(),
        name: Type.String()
    })
} as const satisfies RouteContract;
```

### Optional Fields

```typescript
const contract = {
    method: 'PUT' as const,
    path: '/teams/:id',

    // ⚠️ Optional: Path parameters
    params: Type.Object({
        id: Type.Integer()  // Auto-converts string to number
    }),

    // ⚠️ Optional: Query parameters
    query: Type.Object({
        include: Type.Optional(Type.Array(Type.String())),
        limit: Type.Optional(Type.Number())
    }),

    // ⚠️ Optional: Request body
    body: Type.Object({
        name: Type.String(),
        slug: Type.String()
    }),

    // ⚠️ Optional: Metadata
    meta: {
        skipMiddlewares: ['auth'],      // Skip specific middlewares
        description: 'Update team',     // For documentation
        tags: ['teams']                 // For OpenAPI
    },

    // ✅ Required: Response
    response: Type.Object({
        id: Type.Number(),
        name: Type.String(),
        slug: Type.String()
    })
} as const satisfies RouteContract;
```

### Type Conversion

TypeBox automatically converts URL string values to schema types:

```typescript
// Contract
params: Type.Object({
    id: Type.Integer(),           // String "123" → Number 123
    active: Type.Boolean()        // String "true" → Boolean true
})

query: Type.Object({
    limit: Type.Number(),         // String "10" → Number 10
    tags: Type.Array(Type.String())  // Multiple ?tags=a&tags=b → ['a', 'b']
})
```

---

## Route Handler Context

### Available Properties

```typescript
type RouteContext<TContract> = {
    // Path parameters (typed, auto-converted)
    params: InferContract<TContract>['params'];

    // Query parameters (typed, auto-converted, supports arrays)
    query: InferContract<TContract>['query'];

    // Request body parser (validated)
    data(): Promise<InferContract<TContract>['body']>;

    // JSON response helper (typed)
    json(
        data: InferContract<TContract>['response'],
        status?: number,
        headers?: Record<string, string>
    ): Response;

    // Raw Hono context (for advanced usage)
    raw: Context;
};
```

### Example Usage

```typescript
app.bind(updateTeamContract, async (c) => {
    // ✅ Typed params (auto-converted to number)
    const { id } = c.params;

    // ✅ Typed query (auto-converted)
    const { include } = c.query;

    // ✅ Validated body
    const data = await c.data();

    // ✅ Type-safe response
    return c.json({
        id,
        name: data.name,
        slug: data.slug
    });

    // ✅ Raw Hono context access
    const token = c.raw.req.header('Authorization');
});
```

---

## Middleware Management

### Global Middlewares

Configure in `server.config.ts`:

```typescript
import type { ServerConfig } from '@spfn/core';
import { authMiddleware } from '@spfn/auth';
import { rateLimitMiddleware } from './middlewares/rate-limit';

export default {
    middlewares: [
        { name: 'auth', handler: authMiddleware() },
        { name: 'rateLimit', handler: rateLimitMiddleware() }
    ]
} satisfies ServerConfig;
```

### Method-Level Middleware Control

Skip middlewares per contract using `meta.skipMiddlewares`:

```typescript
// src/lib/contracts/teams.ts

// GET - Public (no auth required)
export const getTeamsContract = {
    method: 'GET' as const,
    path: '/teams',
    response: TeamsResponseSchema,
    meta: {
        skipMiddlewares: ['auth']  // ← Public endpoint
    }
} as const satisfies RouteContract;

// POST - Protected (auth required)
export const createTeamContract = {
    method: 'POST' as const,
    path: '/teams',
    body: CreateTeamSchema,
    response: TeamSchema
    // No skipMiddlewares → auth will run
} as const satisfies RouteContract;

// PUT - Protected (auth required)
export const updateTeamContract = {
    method: 'PUT' as const,
    path: '/teams/:id',
    params: Type.Object({ id: Type.Integer() }),
    body: UpdateTeamSchema,
    response: TeamSchema
    // No skipMiddlewares → auth will run
} as const satisfies RouteContract;
```

**How it works:**
1. Global middlewares registered in server.config.ts
2. `createApp()` stores contract metadata when `app.bind()` is called
3. Auto-loader enables method-level middleware filtering
4. Each middleware checks if it should skip for the current request
5. Skipped middlewares call `next()` immediately

**Benefits:**
- ✅ **Method-level control**: Same path, different policies per HTTP method
- ✅ **Contract-based**: Policy is part of the contract definition
- ✅ **Type-safe**: Full TypeScript support
- ✅ **Zero overhead**: Minimal runtime checks

---

## Validation & Error Handling

### Automatic Validation

All params, query, and body are validated automatically:

```typescript
// Request: GET /teams/abc
// Contract: params: Type.Object({ id: Type.Integer() })
// Result: 400 ValidationError

// Request: GET /teams?limit=abc
// Contract: query: Type.Object({ limit: Type.Number() })
// Result: 400 ValidationError

// Request: POST /teams { "name": 123 }
// Contract: body: Type.Object({ name: Type.String() })
// Result: 400 ValidationError
```

### Error Response Format

```json
{
  "error": {
    "message": "Invalid path parameters",
    "type": "ValidationError",
    "statusCode": 400,
    "details": {
      "fields": [
        {
          "path": "/id",
          "message": "Expected integer",
          "value": "abc"
        }
      ]
    }
  }
}
```

### Custom Validation Errors

```typescript
import { ValidationError } from '@spfn/core';

app.bind(createTeamContract, async (c) => {
    const data = await c.data();

    // Custom business logic validation
    if (await teamSlugExists(data.slug)) {
        throw new ValidationError('Slug already exists', {
            fields: [{
                path: '/slug',
                message: 'Slug already exists',
                value: data.slug
            }]
        });
    }

    // ...
});
```

---

## API Response Helpers (Optional)

SPFN provides optional standardized response helpers for consistent API responses. These are completely opt-in - use them only when you want standardization.

### Success Responses

```typescript
import { ApiResponseSchema } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

const getUserContract = {
    method: 'GET' as const,
    path: '/users/:id',
    params: Type.Object({ id: Type.Integer() }),
    response: ApiResponseSchema(Type.Object({
        id: Type.Number(),
        name: Type.String(),
        email: Type.String()
    }))
} as const satisfies RouteContract;

app.bind(getUserContract, async (c) => {
    const user = await db.getUser(c.params.id);

    // Simple success response
    return c.success(user);
    // → { success: true, data: { id, name, email } }

    // With metadata
    return c.success(user, {
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID()
    });
    // → { success: true, data: {...}, meta: { timestamp, requestId } }

    // With custom status code
    return c.success(newUser, undefined, 201);
});
```

### Error Responses

```typescript
import { NotFoundError, BadRequestError } from '@spfn/core/errors';
import { ApiResponseSchema } from '@spfn/core/route';

app.bind(getUserContract, async (c) => {
    const user = await db.getUser(c.params.id);

    if (!user) {
        throw new NotFoundError('User not found', { userId: c.params.id });
        // → ErrorHandler catches and returns:
        // { success: false, error: { message, type: 'NotFoundError', statusCode: 404, details: {...} } }
    }

    // Custom validation error with details
    if (!isValidEmail(data.email)) {
        throw new BadRequestError('Invalid email format', {
            field: 'email',
            value: data.email
        });
    }

    return c.success(user);
});
```

### Paginated Responses

```typescript
import { ApiResponseSchema } from '@spfn/core/route';

const listUsersContract = {
    method: 'GET' as const,
    path: '/users',
    query: Type.Object({
        page: Type.Number(),
        limit: Type.Number()
    }),
    response: ApiResponseSchema(Type.Array(Type.Object({
        id: Type.Number(),
        name: Type.String()
    })))
} as const satisfies RouteContract;

app.bind(listUsersContract, async (c) => {
    const { page, limit } = c.query;
    const { users, total } = await db.listUsers(page, limit);

    return c.paginated(users, page, limit, total);
    // → {
    //   success: true,
    //   data: [...users],
    //   meta: {
    //     pagination: { page, limit, total, totalPages }
    //   }
    // }
});
```

### TypeBox Schema Helpers

Use schema helpers for type-safe contract definitions:

```typescript
import {
    ApiSuccessSchema,
    ApiErrorSchema,
    ApiResponseSchema
} from '@spfn/core/route';

// Success-only response
const contract1 = {
    response: ApiSuccessSchema(Type.Object({
        id: Type.Number(),
        name: Type.String()
    }))
};

// Error-only response
const contract2 = {
    response: ApiErrorSchema()
};

// Union of success and error (most common)
const contract3 = {
    response: ApiResponseSchema(Type.Object({
        id: Type.Number(),
        name: Type.String()
    }))
    // Equivalent to Type.Union([ApiSuccessSchema(...), ApiErrorSchema()])
};
```

### Response Type Structure

All API responses follow this structure:

```typescript
// Success response
type ApiSuccessResponse<T> = {
    success: true;
    data: T;
    meta?: {
        timestamp?: string;
        requestId?: string;
        pagination?: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
        [key: string]: any;
    };
};

// Error response (consistent with ErrorHandler)
type ApiErrorResponse = {
    success: false;
    error: {
        message: string;
        type: string;
        statusCode: number;
        stack?: string;
        details?: any;
    };
};

// Discriminated union
type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
```

### Integration with ErrorHandler

API responses are fully compatible with the ErrorHandler middleware:

```typescript
import { ErrorHandler } from '@spfn/core';
import { NotFoundError, BadRequestError } from '@spfn/core/errors';
import { ApiResponseSchema } from '@spfn/core/route';

const app = createApp();

// Enable error handler
app.onError(ErrorHandler());

app.bind(contract, async (c) => {
    // ValidationError thrown by bind() is caught by ErrorHandler
    const data = await c.data();  // Auto-validated

    // Manual error handling by throwing HttpError
    if (someCondition) {
        throw new BadRequestError('Custom error');
    }

    return c.success(result);
});

// Both ValidationError and thrown HttpErrors are caught by ErrorHandler:
// { success: false, error: { message, type, statusCode, details? } }
```

### Available HTTP Errors

Throw these errors for consistent error handling:

| Error Class | Status Code | Use Case |
|------------|-------------|----------|
| BadRequestError | 400 | Malformed request or validation failure |
| UnauthorizedError | 401 | Authentication required or failed |
| ForbiddenError | 403 | Authenticated but lacks permission |
| NotFoundError | 404 | Resource not found |
| ConflictError | 409 | Resource state conflict |
| UnprocessableEntityError | 422 | Semantic errors in request |
| InternalServerError | 500 | Generic server error |

```typescript
import { NotFoundError, UnauthorizedError, InternalServerError } from '@spfn/core/errors';

// Throw errors - ErrorHandler catches them automatically
throw new NotFoundError('User not found', { userId: 123 });
throw new UnauthorizedError('Invalid token');
throw new InternalServerError('Database connection failed');
```

### Why Optional?

The API response helpers (`c.success()`, `c.paginated()`) are completely optional because:

1. **Flexibility**: You can use any response format you prefer
2. **Gradual adoption**: Mix and match with existing code
3. **No lock-in**: Response format is not enforced by the framework
4. **Use when needed**: Only use standardization where it adds value

```typescript
// Option 1: Use c.success() for standardization
return c.success(data);
// → { success: true, data: {...} }

// Option 2: Custom format
return c.json({ result: data, timestamp: Date.now() });

// Option 3: Plain response
return c.json(data);

// All are valid! Choose what works best for your use case.
```

---

## Advanced Patterns

### Multiple Response Types with Union

Use `Type.Union()` for success/error responses:

```typescript
export const getTeamContract = {
    method: 'GET' as const,
    path: '/teams/:id',
    params: Type.Object({
        id: Type.Integer()
    }),
    response: Type.Union([
        // Success (200)
        Type.Object({
            id: Type.Number(),
            name: Type.String(),
            slug: Type.String()
        }),
        // Error (404)
        Type.Object({
            error: Type.String(),
            code: Type.String()
        })
    ])
} as const satisfies RouteContract;

// Handler
app.bind(getTeamContract, async (c) => {
    const { id } = c.params;
    const team = await findTeam(id);

    if (!team) {
        return c.json({
            error: 'Team not found',
            code: 'NOT_FOUND'
        }, 404);
    }

    return c.json(team, 200);
});
```

### Query Arrays

```typescript
// Contract
export const searchPostsContract = {
    method: 'GET' as const,
    path: '/posts/search',
    query: Type.Object({
        tags: Type.Array(Type.String()),  // ← Array query param
        limit: Type.Optional(Type.Number())
    }),
    response: PostsResponseSchema
} as const satisfies RouteContract;

// Request: GET /posts/search?tags=javascript&tags=typescript&limit=10
// c.query = { tags: ['javascript', 'typescript'], limit: 10 }

app.bind(searchPostsContract, async (c) => {
    const { tags, limit = 10 } = c.query;
    // tags is string[]
    const posts = await searchPosts({ tags, limit });
    return c.json({ posts });
});
```

### Grouping Contracts

Organize related contracts in one file:

```typescript
// src/lib/contracts/teams.ts
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

// Shared schemas
const TeamSchema = Type.Object({
    id: Type.Number(),
    name: Type.String(),
    slug: Type.String()
});

// All team-related contracts
export const getTeamsContract = { ... };
export const getTeamContract = { ... };
export const createTeamContract = { ... };
export const updateTeamContract = { ... };
export const deleteTeamContract = { ... };
```

### Flexible Handler Organization

Handlers can be organized however you want:

```typescript
// Option 1: One handler file per resource
// src/server/routes/teams.ts
import { createApp } from '@spfn/core/route';
import * as contracts from '../../lib/contracts/teams.js';

const app = createApp();
app.bind(contracts.getTeamsContract, listTeamsHandler);
app.bind(contracts.createTeamContract, createTeamHandler);
// ... all team handlers
export default app;

// Option 2: Split by concern
// src/server/routes/teams/list.ts
import { createApp } from '@spfn/core/route';
import { getTeamsContract } from '../../../lib/contracts/teams.js';

const app = createApp();
app.bind(getTeamsContract, async (c) => { ... });
export default app;

// src/server/routes/teams/create.ts
import { createApp } from '@spfn/core/route';
import { createTeamContract } from '../../../lib/contracts/teams.js';

const app = createApp();
app.bind(createTeamContract, async (c) => { ... });
export default app;
```

---

## API Reference

### `createApp()`

Creates a SPFN app instance with contract-based routing.

```typescript
function createApp(): SPFNApp

type SPFNApp = Hono & {
    bind<TContract extends RouteContract>(
        contract: TContract,
        handler: RouteHandler<TContract>
    ): void;

    bind<TContract extends RouteContract>(
        contract: TContract,
        middlewares: MiddlewareHandler[],
        handler: RouteHandler<TContract>
    ): void;

    _contractMetas?: Map<string, RouteContract['meta']>;
};
```

### `bind(contract, handler)`

Binds a contract to a handler with automatic validation.

```typescript
function bind<TContract extends RouteContract>(
    contract: TContract,
    handler: (c: RouteContext<TContract>) => Response | Promise<Response>
): (c: Context) => Promise<Response>
```

### `loadRoutes(app, options?)`

Automatically loads routes from `src/server/routes/`.

```typescript
function loadRoutes(
    app: Hono,
    options?: {
        routesDir?: string;
        debug?: boolean;
        middlewares?: Array<{ name: string; handler: MiddlewareHandler }>;
    }
): Promise<RouteStats>
```

### `RouteContract`

```typescript
type RouteContract = {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;  // Must be absolute (e.g., '/teams/:id')
    params?: TSchema;
    query?: TSchema;
    body?: TSchema;
    response: TSchema;
    meta?: {
        skipMiddlewares?: string[];
        description?: string;
        tags?: string[];
        deprecated?: boolean;
    };
};
```

---

## Migration from File-based Routing

If you have existing routes using relative paths:

### Before (Relative Paths - OLD)

```typescript
// ❌ src/server/routes/teams/contract.ts
export const getTeamsContract = {
    method: 'GET',
    path: '/',  // ← Relative!
    // ...
};

export const getTeamContract = {
    method: 'GET',
    path: '/:id',  // ← Relative!
    // ...
};
```

### After (Absolute Paths - NEW)

```typescript
// ✅ src/lib/contracts/teams.ts
export const getTeamsContract = {
    method: 'GET' as const,
    path: '/teams',  // ← Absolute!
    // ...
} as const satisfies RouteContract;

export const getTeamContract = {
    method: 'GET' as const,
    path: '/teams/:id',  // ← Absolute!
    // ...
} as const satisfies RouteContract;
```

**Steps:**
1. Move contracts from `src/server/routes/*/contract.ts` to `src/lib/contracts/*.ts`
2. Change all paths to absolute (add resource prefix)
3. Update imports in handler files
4. Run codegen to regenerate API client

---

## Best Practices

### 1. Always Use Absolute Paths

```typescript
// ✅ Good
path: '/teams'
path: '/teams/:id'
path: '/teams/:id/members'

// ❌ Bad - relative paths
path: '/'
path: '/:id'
path: '/:id/members'
```

### 2. Contracts in lib/, Handlers in server/

```typescript
// ✅ Good
src/lib/contracts/teams.ts        # Frontend can import
src/server/routes/teams.ts        # Server-only

// ❌ Bad
src/server/routes/teams/contract.ts  # Frontend can't access
```

### 3. Use TypeScript `satisfies` and `as const`

```typescript
// ✅ Good - type-safe and readonly
export const getTeamsContract = {
    method: 'GET' as const,
    path: '/teams',
    response: Type.Object({...})
} as const satisfies RouteContract;

// ❌ Bad - no type checking
export const getTeamsContract = {
    method: 'GET',
    path: '/teams',
    response: Type.Object({...})
};
```

### 4. Group Related Contracts

```typescript
// ✅ Good - one file per resource
// src/lib/contracts/teams.ts
export const getTeamsContract = { ... };
export const getTeamContract = { ... };
export const createTeamContract = { ... };
export const updateTeamContract = { ... };
export const deleteTeamContract = { ... };

// ❌ Bad - scattered contracts
// src/lib/contracts/get-teams.ts
// src/lib/contracts/create-team.ts
// src/lib/contracts/update-team.ts
```

### 5. Use Type.Integer() for Numeric Path Params

```typescript
// ✅ Good - auto-converts and validates
params: Type.Object({
    id: Type.Integer({ minimum: 1 })
})
// URL "/teams/123" → c.params.id === 123 (number)

// ⚠️ OK - but manual conversion needed
params: Type.Object({
    id: Type.String()
})
// URL "/teams/123" → c.params.id === "123" (string)
```

---

## Troubleshooting

### Error: "Route must use contract-based routing"

**Cause:** Handler file doesn't use `app.bind()` with contracts

**Solution:**
```typescript
// ✅ Must use createApp() and app.bind()
import { createApp } from '@spfn/core/route';
import { getTeamsContract } from '../../lib/contracts/teams.js';

const app = createApp();
app.bind(getTeamsContract, handler);
export default app;

// ❌ Old style not supported
const app = new Hono();
app.get('/teams', handler);
export default app;
```

### Contract not found by codegen

**Cause:** Contract not in `src/lib/contracts/`

**Solution:**
```bash
# ✅ Contracts must be here
src/lib/contracts/teams.ts
src/lib/contracts/users.ts
src/lib/contracts/posts.ts

# ❌ Wrong location
src/server/routes/teams/contract.ts
src/contracts/teams.ts
```

### Routes not loading

**Cause:** Handler file not in `src/server/routes/`

**Solution:**
```bash
# ✅ Handlers must be somewhere in routes/
src/server/routes/teams.ts
src/server/routes/users/index.ts
src/server/routes/admin/posts.ts

# ❌ Wrong location
src/handlers/teams.ts
src/server/teams.ts
```

---

## Related

- [@spfn/core/client](../client/README.md) - API client usage
- [@spfn/core/codegen](../codegen/README.md) - Code generation
- [@spfn/core/errors](../errors/README.md) - Error handling
- [TypeBox](https://github.com/sinclairzx81/typebox) - Schema validation
- [Hono](https://hono.dev) - Underlying framework