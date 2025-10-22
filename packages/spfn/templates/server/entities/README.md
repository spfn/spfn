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

## Pattern 1: Direct Database Access (Simple Queries)

Use `Repository` directly for simple CRUD operations:

```typescript
// src/server/routes/users/index.ts
import { createApp } from '@spfn/core/route';
import { Repository } from '@spfn/core/db';
import { users } from '../../entities/users.js';
import { getUsersContract } from './contract.js';

const app = createApp();

app.bind(getUsersContract, async (c) =>
{
    const repo = new Repository(users);
    const allUsers = await repo.select();
    return c.json(allUsers);
});

export default app;
```

## Pattern 2: Repository Pattern (Recommended for Complex Logic)

For complex business logic, extend Repository with custom methods:

**1. Define entity schema:**

```typescript
// src/server/entities/users.ts
import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';

export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    ...timestamps(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

**2. Create repository with custom methods:**

```typescript
// src/server/repositories/users.repository.ts
import { eq } from 'drizzle-orm';
import { Repository } from '@spfn/core/db';
import { users, type User, type NewUser } from '../entities/users';

export class UserRepository extends Repository<typeof users>
{
    async findByEmail(email: string): Promise<User | null>
    {
        const results = await this.select()
            .where(eq(this.table.email, email))
            .limit(1);
        return results[0] ?? null;
    }

    async create(data: NewUser): Promise<User>
    {
        const [user] = await this.insert()
            .values(data)
            .returning();
        return user;
    }
}

// Export repository instance for reuse
export const userRepository = new UserRepository(users);
```

**3. Use in routes with automatic transactions:**

```typescript
// src/server/routes/users/index.ts
import { createApp } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import { userRepository } from '../../repositories/users.repository';
import { createUserContract } from './contract';

const app = createApp();

// POST /users - Transaction automatically managed by Transactional() middleware
app.bind(createUserContract, [Transactional()], async (c) =>
{
    const data = await c.data();

    // Check if email exists
    const existing = await userRepository.findByEmail(data.email);
    if (existing)
    {
        return c.json({ error: 'Email already exists' }, 409);
    }

    const user = await userRepository.create(data);
    return c.json(user, 201);
});

export default app;
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