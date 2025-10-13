# Entities

Define your Drizzle ORM entities here. These are your database table schemas.

Use `spfn generate <entity-name>` to scaffold a new entity with CRUD routes.

## Entity Helper Functions

SPFN provides helper functions to reduce boilerplate when defining entities:

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps, foreignKey } from '@spfn/core';

// Simple entity with helpers
export const users = pgTable('users', {
    id: id(),                    // bigserial primary key
    email: text('email').unique(),
    ...timestamps(),             // createdAt + updatedAt
});

// Entity with foreign key
export const posts = pgTable('posts', {
    id: id(),
    title: text('title').notNull(),
    authorId: foreignKey('author', () => users.id),  // Cascade delete
    ...timestamps(),
});

export type User = typeof users.$inferSelect;
export type Post = typeof posts.$inferSelect;
```

**Available helpers:**
- `id()` - Auto-incrementing bigserial primary key
- `timestamps()` - Adds `createdAt` and `updatedAt` fields
- `foreignKey(name, ref)` - Foreign key with cascade delete
- `optionalForeignKey(name, ref)` - Nullable foreign key

## Pattern 1: Simple Route (No Repository)

Use `getDb()` directly in routes for simple queries:

```typescript
// src/server/routes/users/index.ts
import type { RouteContext } from '@spfn/core';
import { getDb } from '@spfn/core';
import { users } from '../../entities/users.js';

export async function GET(c: RouteContext)
{
    const db = getDb();
    const allUsers = await db.select().from(users);
    return c.json(allUsers);
}
```

## Pattern 2: Repository Pattern (Recommended)

For complex business logic, use the Repository pattern:

**1. Create a repository:**

```typescript
// src/server/repositories/user.repository.ts
import { eq } from 'drizzle-orm';
import { BaseRepository } from '@spfn/core';
import { users, type User, type NewUser } from '../entities/users.js';

export class UserRepository extends BaseRepository<typeof users, User, NewUser>
{
    constructor()
    {
        super(users);
    }

    async findByEmail(email: string): Promise<User | undefined>
    {
        const db = await this.getDb();
        const result = await db.select().from(users).where(eq(users.email, email));
        return result[0];
    }
}
```

**2. Use in routes with automatic transactions:**

```typescript
// src/server/routes/users/POST.ts
import type { RouteContext } from '@spfn/core';
import { Transactional } from '@spfn/core';
import { UserRepository } from '../../repositories/user.repository.js';

const userRepo = new UserRepository();

// POST /users - Transaction automatically managed by Transactional() middleware
export const POST = [
    Transactional(),
    async (c: RouteContext) =>
    {
        const data = await c.req.json();
        const user = await userRepo.create(data);
        return c.json(user, 201);
    }
];
```

## @spfn/core Features

- **Zero-Config**: Framework auto-loads routes from `routes/` directory
- **File-based Routing**: Next.js App Router style (GET.ts, POST.ts, [id].ts, etc.)
- **Repository Pattern**: Spring Data JPA style with `BaseRepository`
- **Automatic Transactions**: `Transactional()` middleware with AsyncLocalStorage
- **Type-safe DB Access**: `getDb()` automatically uses transaction context when available

## Database Migration

```bash
# Generate migration from your entities
npx drizzle-kit generate:pg

# Run migrations
npx drizzle-kit push:pg
```

## Learn More

- [Getting Started](https://spfn.dev/docs/getting-started)
- [Routing Guide](https://spfn.dev/docs/routing)
- [Repository Pattern](https://spfn.dev/docs/repository)
- [Transaction Management](https://spfn.dev/docs/transactions)