# Route

Type-safe route definition with automatic validation and tRPC-style developer experience.

## Basic Usage

```typescript
import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) => {
        const { params } = await c.data();
        return { id: params.id, name: 'John' };
    });
```

## HTTP Methods

```typescript
route.get('/path')      // GET
route.post('/path')     // POST
route.put('/path')      // PUT
route.patch('/path')    // PATCH
route.delete('/path')   // DELETE
```

## Input Definition

### Path Parameters

```typescript
route.get('/users/:id/posts/:postId')
    .input({
        params: Type.Object({
            id: Type.String(),
            postId: Type.String()
        })
    })
    .handler(async (c) => {
        const { params } = await c.data();
        // params.id, params.postId
    });
```

### Query Parameters

```typescript
route.get('/users')
    .input({
        query: Type.Object({
            page: Type.Number({ default: 1 }),
            limit: Type.Number({ default: 20 }),
            search: Type.Optional(Type.String())
        })
    })
    .handler(async (c) => {
        const { query } = await c.data();
        // query.page, query.limit, query.search
    });
```

### Request Body

```typescript
route.post('/users')
    .input({
        body: Type.Object({
            email: Type.String({ format: 'email' }),
            name: Type.String({ minLength: 1, maxLength: 100 }),
            role: Type.Optional(Type.Union([
                Type.Literal('admin'),
                Type.Literal('user')
            ]))
        })
    })
    .handler(async (c) => {
        const { body } = await c.data();
        // body.email, body.name, body.role
    });
```

### Headers

```typescript
route.get('/protected')
    .input({
        headers: Type.Object({
            authorization: Type.String()
        })
    })
    .handler(async (c) => {
        const { headers } = await c.data();
        // headers.authorization
    });
```

### Cookies

```typescript
route.get('/session')
    .input({
        cookies: Type.Object({
            sessionId: Type.String()
        })
    })
    .handler(async (c) => {
        const { cookies } = await c.data();
        // cookies.sessionId
    });
```

### Form Data (File Upload)

```typescript
import { route, FileSchema, FileArraySchema } from '@spfn/core/route';

// Single file
route.post('/upload')
    .input({
        formData: Type.Object({
            file: FileSchema,
            description: Type.Optional(Type.String())
        })
    })
    .handler(async (c) => {
        const { formData } = await c.data();
        const file = formData.file as File;
        // file.name, file.size, file.type
    });

// Multiple files
route.post('/upload-multiple')
    .input({
        formData: Type.Object({
            files: FileArraySchema
        })
    })
    .handler(async (c) => {
        const { formData } = await c.data();
        const files = formData.files as File[];
    });
```

> **Note:** For detailed file upload patterns including validation, storage, and security, see [File Upload Guide](./file-upload.md).

### Combined Input

```typescript
route.patch('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() }),
        query: Type.Object({ notify: Type.Optional(Type.Boolean()) }),
        body: Type.Object({ name: Type.String() })
    })
    .handler(async (c) => {
        const { params, query, body } = await c.data();
        // All inputs are typed and validated
    });
```

---

## Response Patterns

### Direct Return (Recommended)

Simply return data from handler - automatic JSON response:

```typescript
route.get('/users/:id')
    .handler(async (c) => {
        const user = await userRepo.findById(id);
        return user;  // Automatic c.json(user)
    });
```

### Response Helpers

For custom status codes and headers:

```typescript
route.post('/users')
    .handler(async (c) => {
        const user = await userRepo.create(data);

        // 201 Created with Location header
        return c.created(user, `/users/${user.id}`);
    });

route.delete('/users/:id')
    .handler(async (c) => {
        await userRepo.delete(id);

        // 204 No Content
        return c.noContent();
    });

route.put('/users/:id')
    .handler(async (c) => {
        // Custom status code
        return c.json({ updated: true }, 202);
    });
```

**Available Helpers:**

| Helper | Status | Description |
|--------|--------|-------------|
| `c.json(data, status?)` | Custom | JSON with optional status |
| `c.created(data, location?)` | 201 | Created with Location header |
| `c.accepted(data?)` | 202 | Accepted |
| `c.noContent()` | 204 | No Content |
| `c.notModified()` | 304 | Not Modified |
| `c.paginated(items, page, limit, total)` | 200 | Paginated response |

### Paginated Response

```typescript
route.get('/users')
    .input({
        query: Type.Object({
            page: Type.Number({ default: 1 }),
            limit: Type.Number({ default: 20 })
        })
    })
    .handler(async (c) => {
        const { query } = await c.data();
        const { items, total } = await userRepo.findPaginated(query);

        return c.paginated(items, query.page, query.limit, total);
        // Response: { items: [...], pagination: { page, limit, total, totalPages } }
    });
```

---

## Middleware

### Using Middleware

```typescript
import { Transactional } from '@spfn/core/db';
import { authMiddleware } from './middlewares/auth';

route.post('/users')
    .use([Transactional(), authMiddleware])
    .handler(async (c) => {
        // Runs after middleware chain
    });
```

### Skip Global Middleware

```typescript
// Skip specific middlewares
route.get('/public')
    .skip(['auth', 'rateLimit'])
    .handler(async (c) => { ... });

// Skip all global middlewares
route.get('/health')
    .skip('*')
    .handler(async (c) => { ... });
```

---

## Router Composition

### Define Router

```typescript
import { defineRouter } from '@spfn/core/route';

// Flat structure
export const appRouter = defineRouter({
    getUser,
    createUser,
    updateUser,
    deleteUser
});

// Nested structure
export const appRouter = defineRouter({
    users: defineRouter({
        get: getUser,
        create: createUser
    }),
    posts: defineRouter({
        list: getPosts,
        create: createPost
    })
});
```

### Spread Pattern

```typescript
import * as userRoutes from './routes/users';
import * as postRoutes from './routes/posts';

export const appRouter = defineRouter({
    ...userRoutes,
    ...postRoutes
});
```

---

## Error Handling

### Throwing Errors

```typescript
route.get('/users/:id')
    .handler(async (c) => {
        const user = await userRepo.findById(id);

        if (!user)
        {
            throw new Error('User not found');
        }

        return user;
    });
```

### Using HttpError

```typescript
import { HttpError } from '@spfn/core/errors';

route.get('/protected')
    .handler(async (c) => {
        if (!isAuthenticated)
        {
            throw new HttpError(401, 'Unauthorized');
        }

        return { data: 'secret' };
    });
```

### Validation Errors

Validation errors are automatically thrown when input doesn't match schema:

```typescript
// POST /users with { email: "invalid" }
// → 400 Bad Request
// → { error: "Validation failed", fields: [{ path: "/email", message: "Invalid email format" }] }
```

---

## TypeBox Schema Reference

### Basic Types

```typescript
import { Type } from '@sinclair/typebox';

Type.String()                           // string
Type.Number()                           // number
Type.Integer()                          // integer
Type.Boolean()                          // boolean
Type.Null()                             // null
Type.Array(Type.String())               // string[]
Type.Object({ key: Type.String() })     // { key: string }
```

### String Constraints

```typescript
Type.String({ format: 'email' })
Type.String({ format: 'uri' })
Type.String({ format: 'uuid' })
Type.String({ minLength: 1, maxLength: 100 })
Type.String({ pattern: '^[a-z]+$' })
```

### Number Constraints

```typescript
Type.Number({ minimum: 0, maximum: 100 })
Type.Integer({ minimum: 1 })
Type.Number({ default: 20 })
```

### Optional & Nullable

```typescript
import { Nullable, OptionalNullable } from '@spfn/core/route';

Type.Optional(Type.String())      // string | undefined
Nullable(Type.String())           // string | null
OptionalNullable(Type.String())   // string | null | undefined
```

### Union & Literal

```typescript
// Enum-like
Type.Union([
    Type.Literal('draft'),
    Type.Literal('published'),
    Type.Literal('archived')
])

// Multiple types
Type.Union([Type.String(), Type.Number()])
```

---

## Raw Context Access

For advanced Hono features:

```typescript
route.get('/advanced')
    .handler(async (c) => {
        // Access raw Hono context
        const raw = c.raw;

        // Get custom header
        const customHeader = raw.req.header('x-custom');

        // Set response header
        raw.header('x-response', 'value');

        // Get context variable (set by middleware)
        const user = raw.get('user');

        return { data: 'ok' };
    });
```

---

## Best Practices

### Do

```typescript
// 1. Keep handlers thin - delegate to repository
route.post('/users')
    .handler(async (c) => {
        const { body } = await c.data();
        return userRepo.create(body);  // Simple delegation
    });

// 2. Use Transactional for write operations
route.post('/users')
    .use([Transactional()])
    .handler(async (c) => { ... });

// 3. Define reusable schemas
const UserIdParams = Type.Object({ id: Type.String() });

route.get('/users/:id').input({ params: UserIdParams })...
route.patch('/users/:id').input({ params: UserIdParams })...
route.delete('/users/:id').input({ params: UserIdParams })...
```

### Don't

```typescript
// 1. Don't put business logic in handlers
route.post('/users')
    .handler(async (c) => {
        const { body } = await c.data();

        // Bad - business logic in handler
        const existing = await db.select().from(users).where(eq(users.email, body.email));
        if (existing.length > 0) throw new Error('Email exists');

        return db.insert(users).values(body);
    });

// 2. Don't forget Transactional for writes
route.post('/users')
    .handler(async (c) => {  // Missing Transactional!
        return userRepo.create(body);
    });

// 3. Don't access database directly in routes
route.get('/users')
    .handler(async (c) => {
        // Bad - use repository instead
        return db.select().from(users);
    });
```
