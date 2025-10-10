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
- Stops database health check (if running)
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

---

### startHealthCheck(config)

Start periodic database health checks with automatic reconnection.

```typescript
import { startHealthCheck } from '@spfn/core/db';

startHealthCheck({
    enabled: true,
    interval: 30000,      // 30 seconds
    reconnect: true,
    maxRetries: 5,
    retryInterval: 10000, // 10 seconds
});
```

**Parameters:**
- `config: HealthCheckConfig` - Health check configuration

```typescript
interface HealthCheckConfig {
    enabled: boolean;        // Enable health checks
    interval: number;        // Check interval (ms)
    reconnect: boolean;      // Enable auto-reconnect
    maxRetries: number;      // Max reconnection attempts
    retryInterval: number;   // Retry interval (ms)
}
```

**Returns:** `void`

**Behavior:**
- Periodically runs `SELECT 1` to verify database connection
- Logs health check status
- Attempts reconnection on failure (if enabled)
- Safe to call multiple times (no-op if already running)

**Note:** Health checks are automatically started by `initDatabase()` when enabled. Manual use is typically not needed.

---

### stopHealthCheck()

Stop database health checks.

```typescript
import { stopHealthCheck } from '@spfn/core/db';

stopHealthCheck();
```

**Returns:** `void`

**Behavior:**
- Stops periodic health checks
- Safe to call multiple times
- No-op if health check is not running

**Note:** Health checks are automatically stopped by `closeDatabase()`. Manual use is typically not needed.

---

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

### Health Check Configuration

The framework provides automatic database health checks with reconnection support. Health checks are **enabled by default** and start automatically when `initDatabase()` is called.

**Priority (highest to lowest):**
1. **ServerConfig** (`server.config.ts`) - Application-level configuration
2. **Environment Variables** - Runtime configuration
3. **Defaults** - Automatic configuration

#### Method 1: ServerConfig (Recommended)

Configure health check settings in `server.config.ts`:

```typescript
// src/server/server.config.ts
import type { ServerConfig } from '@spfn/core';

export default {
    database: {
        healthCheck: {
            enabled: true,           // Enable health checks (default: true)
            interval: 30000,         // Check every 30 seconds (default: 60000)
            reconnect: true,         // Auto-reconnect on failure (default: true)
            maxRetries: 5,           // Max reconnection attempts (default: 3)
            retryInterval: 10000,    // Wait 10s between retries (default: 5000)
        },
    },
} satisfies ServerConfig;
```

#### Method 2: Environment Variables

Set health check configuration via environment variables:

```bash
# .env
DB_HEALTH_CHECK_ENABLED=true
DB_HEALTH_CHECK_INTERVAL=30000
DB_HEALTH_CHECK_RECONNECT=true
DB_HEALTH_CHECK_MAX_RETRIES=5
DB_HEALTH_CHECK_RETRY_INTERVAL=10000
```

These override defaults but are overridden by ServerConfig.

#### Method 3: Automatic Defaults

If neither ServerConfig nor environment variables are set, defaults are used:

```typescript
enabled: true        // Health checks enabled by default
interval: 60000      // Check every 60 seconds
reconnect: true      // Auto-reconnect enabled
maxRetries: 3        // Try reconnecting 3 times
retryInterval: 5000  // Wait 5 seconds between retries
```

#### Method 4: Manual Configuration (Advanced)

For full control, pass options directly to `initDatabase()`:

```typescript
import { initDatabase } from '@spfn/core/db';

await initDatabase({
    healthCheck: {
        enabled: true,
        interval: 30000,
        reconnect: true,
        maxRetries: 5,
        retryInterval: 10000,
    },
});
```

#### Disabling Health Checks

To disable automatic health checks:

```typescript
// src/server/server.config.ts
export default {
    database: {
        healthCheck: {
            enabled: false,
        },
    },
} satisfies ServerConfig;
```

Or via environment variable:

```bash
# .env
DB_HEALTH_CHECK_ENABLED=false
```

#### How Health Checks Work

1. **Periodic Checks**: Runs `SELECT 1` query at configured interval
2. **Failure Detection**: Logs error if query fails
3. **Auto-Reconnection**: Attempts to reconnect if enabled
4. **Retry Logic**: Waits `retryInterval` between attempts (up to `maxRetries`)
5. **Graceful Shutdown**: Automatically stopped by `closeDatabase()`

#### Health Check Logs

Health checks produce structured logs:

```typescript
// Success
dbLogger.debug('Database health check passed');

// Failure
dbLogger.error('Database health check failed', { error: message });

// Reconnection
dbLogger.warn('Attempting database reconnection', {
    maxRetries: 3,
    retryInterval: '5000ms',
});

// Success after reconnection
dbLogger.info('Database reconnection successful', { attempt: 2 });
```

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

### Health check failing repeatedly

**Cause:** Database connection lost or network issues

**Solutions:**

**Option 1: Check database logs**
```bash
# Check if database is running
docker ps | grep postgres

# Check database logs
docker logs <container-name>
```

**Option 2: Verify connection string**
```bash
# .env
DATABASE_URL=postgresql://localhost:5432/mydb
```

**Option 3: Adjust health check configuration**
```typescript
// src/server/server.config.ts
export default {
    database: {
        healthCheck: {
            interval: 120000,        // Check less frequently
            maxRetries: 10,          // More retry attempts
            retryInterval: 15000,    // Longer wait between retries
        },
    },
} satisfies ServerConfig;
```

**Option 4: Disable health check temporarily (not recommended)**
```bash
# .env
DB_HEALTH_CHECK_ENABLED=false
```

### Health check reconnection not working

**Cause:** Max retries exhausted or reconnection disabled

**Solutions:**

**Option 1: Enable reconnection**
```typescript
// src/server/server.config.ts
export default {
    database: {
        healthCheck: {
            reconnect: true,      // Enable auto-reconnect
            maxRetries: 5,        // Increase retry attempts
        },
    },
} satisfies ServerConfig;
```

**Option 2: Via environment variables**
```bash
# .env
DB_HEALTH_CHECK_RECONNECT=true
DB_HEALTH_CHECK_MAX_RETRIES=10
```

**Option 3: Check logs for specific errors**
```typescript
// Look for these log messages:
// - "Database health check failed"
// - "Attempting database reconnection"
// - "Reconnection attempt X failed"
// - "Max reconnection attempts reached"
```

### Too many health check logs

**Cause:** Health check interval too short or debug logging enabled

**Solutions:**

**Option 1: Increase check interval**
```typescript
// src/server/server.config.ts
export default {
    database: {
        healthCheck: {
            interval: 300000,  // Check every 5 minutes
        },
    },
} satisfies ServerConfig;
```

**Option 2: Configure logger level**
```typescript
// Health check success messages use dbLogger.debug()
// Only errors use dbLogger.error()
// Configure your logger to filter debug messages in production
```