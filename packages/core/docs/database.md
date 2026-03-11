# Database

PostgreSQL database layer with Drizzle ORM, automatic transaction management, and read/write separation.

## Setup

### Environment Variables

```bash
# Single database
DATABASE_URL=postgresql://localhost:5432/mydb

# Primary + Replica (recommended for production)
DATABASE_WRITE_URL=postgresql://primary:5432/mydb
DATABASE_READ_URL=postgresql://replica:5432/mydb
```

### Initialize

```typescript
import { initDatabase } from '@spfn/core/db';

// Called automatically by startServer()
// Manual call only needed for scripts
await initDatabase();
```

---

## Helper Functions

Standalone functions for simple database operations.

```typescript
import {
    findOne,
    findMany,
    create,
    createMany,
    upsert,
    updateOne,
    updateMany,
    deleteOne,
    deleteMany,
    count
} from '@spfn/core/db';
```

### findOne

Find a single record.

```typescript
// Object-based where (simple equality)
const user = await findOne(users, { id: '1' });
const user = await findOne(users, { email: 'test@example.com' });

// SQL-based where (complex conditions)
import { eq, and, gt } from 'drizzle-orm';
const user = await findOne(users, and(
    eq(users.email, 'test@example.com'),
    eq(users.isActive, true)
));
```

### findMany

Find multiple records with filtering, ordering, and pagination.

```typescript
// Simple
const allUsers = await findMany(users);

// With options
const activeUsers = await findMany(users, {
    where: { isActive: true },
    orderBy: desc(users.createdAt),
    limit: 10,
    offset: 0
});

// Complex where
const recentAdmins = await findMany(users, {
    where: and(
        eq(users.role, 'admin'),
        gt(users.createdAt, lastWeek)
    ),
    orderBy: [desc(users.createdAt), asc(users.name)],
    limit: 20
});
```

### create

Create a single record.

```typescript
const user = await create(users, {
    email: 'new@example.com',
    name: 'New User'
});
```

### createMany

Create multiple records.

```typescript
const newUsers = await createMany(users, [
    { email: 'user1@example.com', name: 'User 1' },
    { email: 'user2@example.com', name: 'User 2' }
]);
```

### upsert

Insert or update on conflict.

```typescript
const cache = await upsert(cmsCache, data, {
    target: [cmsCache.section, cmsCache.locale],
    set: {
        content: data.content,
        updatedAt: new Date()
    }
});
```

### updateOne

Update a single record. Returns updated record or null.

```typescript
const updated = await updateOne(users, { id: '1' }, { name: 'Updated Name' });
if (!updated)
{
    throw new Error('User not found');
}
```

### updateMany

Update multiple records. Returns array of updated records.

```typescript
const updated = await updateMany(
    users,
    { role: 'guest' },
    { isActive: false }
);
```

### deleteOne

Delete a single record. Returns deleted record or null.

```typescript
const deleted = await deleteOne(users, { id: '1' });
```

### deleteMany

Delete multiple records. Returns array of deleted records.

```typescript
const deleted = await deleteMany(users, { isActive: false });
```

### count

Count records.

```typescript
const total = await count(users);
const activeCount = await count(users, { isActive: true });
const adminCount = await count(users, eq(users.role, 'admin'));
```

---

## Transaction

### Transactional Middleware

Use in routes for automatic commit/rollback.

```typescript
import { Transactional } from '@spfn/core/db';

route.post('/users')
    .use([Transactional()])
    .handler(async (c) => {
        // Auto commit on success
        // Auto rollback on error
        return userRepo.create(body);
    });
```

**With options:**

```typescript
Transactional({
    timeout: 30000,      // Transaction timeout (ms)
    logSuccess: false,   // Log successful transactions
    logErrors: true      // Log failed transactions
})
```

### Manual Transaction

For complex multi-operation scenarios.

```typescript
import { runWithTransaction } from '@spfn/core/db';

await runWithTransaction(async () => {
    const user = await userRepo.create(userData);
    await profileRepo.create({ userId: user.id, ...profileData });
    await emailService.sendWelcome(user.email);
    // All succeed or all rollback
});
```

### After-Commit Hooks

Schedule side effects to run only after the transaction commits.

```typescript
import { onAfterCommit } from '@spfn/core/db';

async function submitRequest(spaceId: string, chatId: string)
{
    const publication = await publicationRepo.create({ spaceId, chatId });
    await requestRepo.updateStatusAtomically(requestId, 'submitted');

    // Runs after commit, fire-and-forget
    onAfterCommit(() => generateArticle(spaceId, chatId, publication.id));

    return publication;
}
```

- Inside transaction: queued, executed after root commit
- Outside transaction: executed immediately
- Nested transactions: callbacks bubble up to root
- Errors are logged, never thrown

### Get Current Transaction

Access the current transaction context.

```typescript
import { getTransaction } from '@spfn/core/db';

async function customDbOperation()
{
    const tx = getTransaction();
    if (tx)
    {
        // Inside transaction
        await tx.insert(users).values(data);
    }
    else
    {
        // Not in transaction
        const db = getDatabase('write');
        await db.insert(users).values(data);
    }
}
```

---

## Direct Database Access

For complex queries not covered by helpers.

```typescript
import { getDatabase } from '@spfn/core/db';

// Read operations (uses replica if available)
const db = getDatabase('read');
const results = await db
    .select({
        user: users,
        postsCount: sql`count(${posts.id})`
    })
    .from(users)
    .leftJoin(posts, eq(users.id, posts.authorId))
    .groupBy(users.id);

// Write operations (always uses primary)
const db = getDatabase('write');
await db.insert(users).values(data);
```

---

## Connection Info

```typescript
import { getDatabaseInfo, checkConnection } from '@spfn/core/db';

// Get connection status
const info = getDatabaseInfo();
// { hasWriteDb: true, hasReadDb: true, pattern: 'write-read' }

// Health check
const isHealthy = await checkConnection(getDatabase('write'));
```

---

## Cleanup

```typescript
import { closeDatabase } from '@spfn/core/db';

// Called automatically on graceful shutdown
// Manual call for scripts/tests
await closeDatabase();
```

---

## Best Practices

### Do

```typescript
// 1. Use Transactional for write routes
route.post('/users')
    .use([Transactional()])
    .handler(...)

// 2. Use repository pattern for data access
const user = await userRepo.findById(id);

// 3. Use read database for read operations
async findAll()
{
    return this._findMany(users);  // BaseRepository uses readDb
}

// 4. Close connections in tests
afterAll(async () => {
    await closeDatabase();
});
```

### Don't

```typescript
// 1. Don't forget Transactional for writes
route.post('/users')
    .handler(async (c) => {  // Missing Transactional!
        await userRepo.create(body);
    });

// 2. Don't bypass repository in routes
route.get('/users')
    .handler(async (c) => {
        // Bad - use repository
        return getDatabase('read').select().from(users);
    });

// 3. Don't use write database for reads
const db = getDatabase('write');  // Bad for read queries
await db.select().from(users);
```
