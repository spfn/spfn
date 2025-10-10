# Database Manager

Manual database lifecycle management for advanced use cases and testing.

## Overview

The Database Manager provides low-level control over database connections. Most applications should use the automatic setup via `createDatabaseFromEnv()` and `getDb()`.

**Use Database Manager when:**
- Writing tests that need isolated database instances
- Building custom database initialization logic
- Managing multiple database connections
- Implementing database health checks

## API Reference

### initDatabase(config)

Initialize the global database instance.

```typescript
import { initDatabase } from '@spfn/core/db';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

initDatabase(db);
```

**Parameters:**
- `config: Database | DatabaseConfig` - Drizzle instance or config object

**Returns:** `void`

**Throws:** `DatabaseError` if database is already initialized

---

### getDatabase()

Get the current database instance.

```typescript
import { getDatabase } from '@spfn/core/db';

const db = getDatabase();
// db is typed as Database (Drizzle PostgreSQL instance)
```

**Returns:** `Database`

**Throws:** `DatabaseNotInitializedError` if database hasn't been initialized

**Alias:** `getDb()` - Shorter version for convenience

---

### setDatabase(db)

Replace the current database instance.

```typescript
import { setDatabase } from '@spfn/core/db';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const newClient = postgres('postgresql://localhost:5432/test');
const newDb = drizzle(newClient);

setDatabase(newDb);
```

**Parameters:**
- `db: Database` - New Drizzle instance

**Returns:** `void`

**Use Cases:**
- Switching databases during test lifecycle
- Hot-swapping connections for failover
- Implementing read replicas

---

### closeDatabase()

Close and cleanup the current database connection.

```typescript
import { closeDatabase } from '@spfn/core/db';

await closeDatabase();
```

**Returns:** `Promise<void>`

**Behavior:**
- Closes the underlying PostgreSQL connection
- Clears the global database instance
- Safe to call multiple times
- No-op if database is not initialized

**Important:** After calling `closeDatabase()`, you must call `initDatabase()` again before using `getDb()`.

---

### getDatabaseInfo()

Get metadata about the current database connection.

```typescript
import { getDatabaseInfo } from '@spfn/core/db';

const info = getDatabaseInfo();
console.log(info);
// {
//   initialized: true,
//   client: 'postgres',
//   connectionString: 'postgresql://...',
//   poolSize: 10
// }
```

**Returns:** `DatabaseInfo`

```typescript
interface DatabaseInfo {
    initialized: boolean;
    client?: string;
    connectionString?: string;
    poolSize?: number;
}
```

**Use Cases:**
- Health check endpoints
- Debugging connection issues
- Monitoring database status

---

### createDatabaseFromEnv()

Create and initialize database from environment variables.

```typescript
import { createDatabaseFromEnv } from '@spfn/core/db';

// Reads DATABASE_URL from process.env
const db = createDatabaseFromEnv();
```

**Environment Variables:**
- `DATABASE_URL` (required) - PostgreSQL connection string

**Returns:** `Database`

**Example:**
```bash
# .env
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
```

```typescript
import { createDatabaseFromEnv, getDb } from '@spfn/core/db';

// Initialize once at app startup
createDatabaseFromEnv();

// Use getDb() everywhere else
const db = getDb();
```

## Testing Patterns

### Pattern 1: Isolated Test Database

```typescript
import { describe, it, beforeEach, afterEach } from 'vitest';
import { Repository, initDatabase, closeDatabase } from '@spfn/core/db';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

describe('User Repository', () => {
    beforeEach(async () => {
        // Create fresh database for each test
        const client = postgres('postgresql://localhost:5432/test');
        const db = drizzle(client);
        initDatabase(db);

        // Run migrations
        await migrate(db, { migrationsFolder: './drizzle' });
    });

    afterEach(async () => {
        // Clean up after each test
        await closeDatabase();
    });

    it('should create user', async () => {
        const repo = new Repository(users);
        const user = await repo.save({ email: 'test@example.com' });
        expect(user.id).toBeDefined();
    });
});
```

### Pattern 2: Transaction Rollback Testing

```typescript
import { describe, it, beforeAll, afterAll, afterEach } from 'vitest';
import { getDb, initDatabase, closeDatabase } from '@spfn/core/db';

describe('Transaction Tests', () => {
    beforeAll(async () => {
        const client = postgres(process.env.TEST_DATABASE_URL!);
        const db = drizzle(client);
        initDatabase(db);
    });

    afterEach(async () => {
        // Rollback after each test
        const db = getDb();
        await db.execute(sql`ROLLBACK`);
    });

    afterAll(async () => {
        await closeDatabase();
    });

    it('should rollback on error', async () => {
        const db = getDb();
        await db.execute(sql`BEGIN`);

        // Test code that should rollback...
    });
});
```

### Pattern 3: Multiple Database Connections

```typescript
import { setDatabase, getDb } from '@spfn/core/db';

// Primary database
const primary = drizzle(postgres('postgresql://localhost:5432/primary'));
setDatabase(primary);

// Perform write operations
const db = getDb();
await db.insert(users).values({ email: 'test@example.com' });

// Switch to read replica
const replica = drizzle(postgres('postgresql://localhost:5433/replica'));
setDatabase(replica);

// Perform read operations
const readDb = getDb();
const allUsers = await readDb.select().from(users);
```

## Advanced Configuration

### Connection Pool Configuration

The framework provides flexible connection pool configuration with three priority levels:

**Priority (highest to lowest):**
1. **ServerConfig** (`server.config.ts`) - Application-level configuration
2. **Environment Variables** - Runtime configuration
3. **Defaults** - NODE_ENV-based automatic configuration

#### Method 1: ServerConfig (Recommended)

Configure pool settings in `server.config.ts`:

```typescript
// src/server/server.config.ts
import type { ServerConfig } from '@spfn/core';

export default {
    database: {
        pool: {
            max: 50,            // Maximum pool size
            idleTimeout: 60,    // Idle connection timeout (seconds)
        },
    },
} satisfies ServerConfig;
```

#### Method 2: Environment Variables

Set pool configuration via environment variables:

```bash
# .env
DB_POOL_MAX=30
DB_POOL_IDLE_TIMEOUT=45
```

These override defaults but are overridden by ServerConfig.

#### Method 3: Automatic Defaults

If neither ServerConfig nor environment variables are set, defaults are used:

```typescript
// Production (NODE_ENV=production)
max: 20
idleTimeout: 30

// Development (NODE_ENV=development)
max: 10
idleTimeout: 20
```

#### Method 4: Manual Pool Configuration (Advanced)

For full control, pass options directly to `initDatabase()`:

```typescript
import { initDatabase } from '@spfn/core/db';

await initDatabase({
    pool: {
        max: 100,
        idleTimeout: 120,
    },
});
```

#### Low-Level Configuration (Not Recommended)

For advanced use cases requiring full postgres.js control:

```typescript
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { setDatabase } from '@spfn/core/db';

const client = postgres(process.env.DATABASE_URL!, {
    max: 20,                    // Maximum pool size
    idle_timeout: 30,           // Close idle connections after 30s
    connect_timeout: 10,        // Connection timeout
    prepare: false,             // Disable prepared statements
    onnotice: () => {},         // Suppress notices
});

const db = drizzle(client);
setDatabase(db);
```

**Note:** Using low-level configuration bypasses the framework's pool management. Prefer ServerConfig or environment variables.

### Connection String Format

```bash
# Basic format
DATABASE_URL=postgresql://user:password@host:port/database

# With SSL
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require

# With connection pool options
DATABASE_URL=postgresql://user:password@host:port/database?max=20&idle_timeout=30

# Local development
DATABASE_URL=postgresql://localhost:5432/myapp_dev

# Production (Railway, Render, etc.)
DATABASE_URL=postgresql://user:pass@containers-us-west-xxx.railway.app:5432/railway
```

## Error Handling

### DatabaseNotInitializedError

Thrown when trying to access database before initialization.

```typescript
import { getDb } from '@spfn/core/db';
import { DatabaseNotInitializedError } from '@spfn/core/errors';

try {
    const db = getDb();
} catch (error) {
    if (error instanceof DatabaseNotInitializedError) {
        console.error('Database not initialized. Call initDatabase() first.');
    }
}
```

### DatabaseError

General database operation errors.

```typescript
import { initDatabase } from '@spfn/core/db';
import { DatabaseError } from '@spfn/core/errors';

try {
    initDatabase(db);
    initDatabase(db); // Error: already initialized
} catch (error) {
    if (error instanceof DatabaseError) {
        console.error('Database error:', error.message);
    }
}
```

## Best Practices

### 1. Initialize Once

```typescript
// ✅ Good: Initialize once at app startup
// src/server/app.ts
import { createDatabaseFromEnv } from '@spfn/core/db';

createDatabaseFromEnv();

// ❌ Bad: Initializing in multiple places
// routes/users.ts
createDatabaseFromEnv(); // Don't do this
```

### 2. Use getDb() in Application Code

```typescript
// ✅ Good: Use getDb() for database access
import { getDb } from '@spfn/core/db';

export async function getUsers() {
    const db = getDb();
    return db.select().from(users);
}

// ❌ Bad: Creating new connections
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

export async function getUsers() {
    const client = postgres(process.env.DATABASE_URL!); // Don't do this
    const db = drizzle(client);
    return db.select().from(users);
}
```

### 3. Always Close in Tests

```typescript
// ✅ Good: Clean up after tests
afterEach(async () => {
    await closeDatabase();
});

// ❌ Bad: Leaving connections open
// Tests finish but process hangs due to open connections
```

### 4. Use Environment Variables

```typescript
// ✅ Good: Use createDatabaseFromEnv()
import { createDatabaseFromEnv } from '@spfn/core/db';
createDatabaseFromEnv();

// ❌ Bad: Hardcoding connection strings
initDatabase(drizzle(postgres('postgresql://localhost:5432/mydb')));
```

## Troubleshooting

### "Database not initialized" error

**Cause:** Trying to use `getDb()` before calling `initDatabase()` or `createDatabaseFromEnv()`

**Solution:**
```typescript
// Add to app startup
import { createDatabaseFromEnv } from '@spfn/core/db';
createDatabaseFromEnv();
```

### Tests hang after completion

**Cause:** Database connections not closed

**Solution:**
```typescript
afterAll(async () => {
    await closeDatabase();
});
```

### "Database already initialized" error

**Cause:** Calling `initDatabase()` multiple times

**Solution:**
```typescript
// Initialize only once at app startup
// OR in tests, call closeDatabase() before re-initializing

beforeEach(async () => {
    await closeDatabase(); // Clean up previous instance
    initDatabase(db);
});
```

### Connection pool exhaustion

**Cause:** Too many concurrent queries or connections not being released

**Solutions:**

**Option 1: ServerConfig (Recommended)**
```typescript
// src/server/server.config.ts
export default {
    database: {
        pool: {
            max: 50,  // Increase from default
        },
    },
} satisfies ServerConfig;
```

**Option 2: Environment Variables**
```bash
# .env
DB_POOL_MAX=50
```

**Option 3: Direct Configuration**
```typescript
await initDatabase({
    pool: { max: 50 }
});
```

**Option 4: Use transactions properly** to release connections faster