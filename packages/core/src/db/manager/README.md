# SPFN Database Manager

Database connection management with support for Primary + Replica pattern, health checks, and automatic reconnection.

## 📁 Architecture

```
manager/
├── manager.ts                 # Core database manager
├── global-state.ts            # Global state (instances, isClosing, initOptions)
├── health-check.ts            # Periodic health check + reconnect retry loop
├── reconnect-trigger.ts       # Query-error driven fast-path pool rebuild
├── config.ts                  # Configuration & utilities
├── factory.ts                 # Database factory with pattern detection
├── connection.ts              # Connection logic with retry
├── config-generator.ts        # Drizzle Kit config generator
├── index.ts                   # Public API exports
└── __tests__/
    ├── config.test.ts
    ├── connection.test.ts
    ├── factory.test.ts
    ├── manager.test.ts
    ├── health-check.test.ts
    └── reconnect-trigger.test.ts
```

## 🏗️ Module Responsibilities

### manager.ts (Core API)
Main entry point for database operations:
- `initDatabase()` - Initialize database with auto-detection
- `getDatabase()` - Get database instance (throws if not initialized)
- `setDatabase()` - Set database instance (testing)
- `closeDatabase()` - Gracefully close connections
- `forceReconnectDatabase()` - Destroy and rebuild the pool on demand (atomic swap)
- `getDatabaseInfo()` - Get connection info (debugging)
- `getDatabaseMonitoringConfig()` - Get monitoring config

### global-state.ts (State Management)
Global state management using `globalThis`:
- Singleton instance accessors (write/read drizzle + raw postgres clients)
- `isClosing` flag shared across modules (prevents reconnect racing close)
- `initOptions` persisted so `forceReconnectDatabase()` reuses the same config
- Persistent state across module reloads (HMR-friendly)

### health-check.ts (Monitoring & Reconnection)
Automatic health monitoring and recovery:
- `startHealthCheck()` - Periodic `SELECT 1` on write/read instances
- `stopHealthCheck()` - Stop health checks
- `triggerForceReconnect(reason)` - Internal entry for on-demand rebuild
- Atomic swap reconnection: new pool created and tested BEFORE old pool is closed
- `isReconnecting` gate coalesces concurrent callers (periodic + force) to one rebuild
- `isClosing` gate bails out before swap to prevent leaking into a torn-down globalThis

### reconnect-trigger.ts (Query-Error Fast-Path)
Sliding-window error reporter that shortens reconnect detection from ~60s
(periodic health check) to a few seconds:
- `reportDatabaseError(error)` - Feed caught query errors; non-connection errors are no-ops
- `isConnectionLevelError(error)` - Classifier (postgres.js codes, Node errno, PG SQLSTATE 08/53300/57P0x, walks cause chain)
- `resetConnectionErrorCounter()` - Test helper
- WeakSet dedup: same underlying failure counted once even when re-wrapped across repository + middleware
- Auto-hooked from `BaseRepository.withContext` and `@Transactional` middleware —
  application code does not need to call it manually

### config.ts (Configuration)
Configuration builders and utilities:
- `getPoolConfig()` - Connection pool settings
- `getRetryConfig()` - Retry strategy settings
- `buildHealthCheckConfig()` - Health check settings
- `buildMonitoringConfig()` - Query monitoring settings
- Environment variable parsing utilities

### factory.ts (Database Factory)
Auto-detection and database creation:
- Pattern detection (write-read, legacy, single)
- Environment variable auto-detection
- Type-safe pattern matching with switch
- Password masking in logs

### connection.ts (Connection)
Low-level connection management:
- Exponential backoff retry logic
- Connection testing and validation
- Detailed error logging
- postgres.js client creation

### config-generator.ts (Drizzle Kit & Schema Discovery)
Drizzle Kit configuration generator with package schema auto-discovery:
- Auto-detect dialect from connection string
- Generate `drizzle.config.ts`
- Support for migrations and schema
- **Package schema auto-discovery**
- Scan `@spfn/*` packages and direct dependencies
- Support for package-specific migrations
- Nested entity folder support (`**/*.ts`)

## 🚀 Quick Start

### Basic Usage

```typescript
import { initDatabase, getDatabase, closeDatabase } from '@spfn/core/db';

// Initialize database (auto-detects from environment)
await initDatabase();

// Get database instance
const db = getDatabase('write');  // or 'read'

// Use database
const users = await db.select().from(usersTable);

// Graceful shutdown
await closeDatabase();
```

### Environment Variables

**Single Database** (most common):
```bash
DATABASE_URL=postgresql://localhost:5432/mydb
```

**Primary + Replica** (recommended for production):
```bash
DATABASE_WRITE_URL=postgresql://primary:5432/mydb
DATABASE_READ_URL=postgresql://replica:5432/mydb
```

### Advanced Configuration

```typescript
import { initDatabase } from '@spfn/core/db';

await initDatabase({
  // Connection pool
  pool: {
    max: 50,              // Max connections
    idleTimeout: 60,      // Idle timeout (seconds)
  },

  // Health checks
  healthCheck: {
    enabled: true,
    interval: 30000,      // 30 seconds
    reconnect: true,
    maxRetries: 5,
    retryInterval: 5000,  // 5 seconds
  },

  // Query monitoring
  monitoring: {
    enabled: true,
    slowThreshold: 1000,  // 1 second
    logQueries: false,
  },
});
```

## 🔁 Pool Recovery

When a PostgreSQL server restarts, a network partition heals, or a deploy
rotates the DB, the entire `postgres.js` pool can end up holding dead sockets.
SPFN recovers this in two ways:

### 1. Periodic health check (interval-driven)
`startHealthCheck()` runs `SELECT 1` every `DB_HEALTH_CHECK_INTERVAL` (default
60s). On failure it invokes `attemptReconnection()`, which uses an **atomic
swap**: a fresh pool is created and validated *before* `setWriteInstance()`
replaces the global reference, and only then are the old `postgres.js` clients
torn down via `client.end({ timeout: 5 })`.

### 2. Query-error fast-path (error-driven)
The periodic check can false-pass (postgres.js transparently opens a new
socket for a single `SELECT 1` while other dead sockets remain). To cover this,
`reconnect-trigger.ts` watches real query errors from the application path —
`BaseRepository.withContext` and `@Transactional` middleware both feed caught
errors to `reportDatabaseError()`. Once `DB_RECONNECT_ERROR_THRESHOLD` (default 3)
connection-level failures occur within `DB_RECONNECT_ERROR_WINDOW_MS` (default
10s), the trigger calls the same atomic-swap rebuild as the health check.

Recovery latency drops from up to 60s to a few seconds.

### Manual trigger (operator escape hatch)

```typescript
import { forceReconnectDatabase } from '@spfn/core/db';

// Admin endpoint for operators
app.post('/admin/db/reconnect', async (c) => {
    const ran = await forceReconnectDatabase('admin_request');
    return c.json({ reconnected: ran });
});
```

`forceReconnectDatabase(reason?)` returns:
- `true` — a rebuild actually ran
- `false` — skipped because the DB is not initialized, is currently closing,
  or a reconnect is already in progress (concurrent callers coalesce to one rebuild)

### Safety invariants
- **No parallel rebuilds**: `isReconnecting` is checked+set at the entry of
  `attemptReconnection` in a single sync block — concurrent callers coalesce.
- **No leaked pools on shutdown**: `reconnectAndRestore()` re-checks
  `getIsClosing()` after `createDatabaseFromEnv` awaits; if close started
  mid-rebuild, the freshly-created clients are torn down instead of being
  swapped into a globalThis that `closeDatabase` is about to clear.
- **No implicit lazy init**: `forceReconnectDatabase` returns `false` if
  `initDatabase()` was never called.
- **No double-counting**: a single query failure caught by both
  `BaseRepository.withContext` and `@Transactional` middleware counts as one
  logical failure (WeakSet dedup across the cause chain).

### Advanced: custom catch sites

If you execute drizzle queries outside `BaseRepository` and `@Transactional`
and still want the fast-path, feed your catch blocks to the reporter:

```typescript
import { reportDatabaseError, isConnectionLevelError } from '@spfn/core/db';

try {
    await db.execute(sql`...`);
}
catch (error) {
    reportDatabaseError(error);   // no-op for non-connection errors
    throw error;
}

// Or classify manually
if (isConnectionLevelError(error)) {
    // route to retry logic, circuit breaker, etc.
}
```

## 📦 Package Schema Discovery

SPFN automatically discovers database schemas from installed packages, enabling a plugin-like architecture where packages can provide their own database schemas without creating hard dependencies.

### How It Works

**1. Package Declaration**

Packages declare their schemas in `package.json`:

```json
{
  "name": "@spfn/cms",
  "spfn": {
    "schemas": ["./dist/entities/*.js"],
    "setupMessage": "📚 Next steps:\n  1. Import components..."
  }
}
```

**2. Automatic Discovery**

During migration generation, SPFN scans for schemas in:
- All `@spfn/*` packages (official ecosystem)
- Direct dependencies with `spfn.schemas` field in `package.json`
- **Note**: Transitive dependencies are NOT scanned (performance optimization)

**3. Schema Merging**

All discovered schemas are merged with your app's schemas:

```typescript
import { getDrizzleConfig } from '@spfn/core'

const config = getDrizzleConfig({
  cwd: process.cwd()
})
// Returns merged schemas from:
// - ./src/server/entities/**/*.ts (your app)
// - node_modules/@spfn/cms/dist/entities/*.js
// - node_modules/@spfn/auth/dist/entities/*.js
// - etc.
```

### Usage

**Zero-Config** (auto-discovers all packages):

```typescript
import { getDrizzleConfig } from '@spfn/core'

const config = getDrizzleConfig()
```

**Package-Specific Migrations** (for `spfn add` command):

```typescript
import { generateDrizzleConfigFile } from '@spfn/core'

const configContent = generateDrizzleConfigFile({
  cwd: process.cwd(),
  packageFilter: '@spfn/cms'  // Only include CMS schemas
})
```

**Disable Package Discovery**:

```typescript
const config = getDrizzleConfig({
  disablePackageDiscovery: true
})
```

### Scanning Strategy

For optimal performance, SPFN uses a targeted scanning approach:

1. **Read project's `package.json`**
   - Extract direct dependencies and devDependencies

2. **Scan `@spfn/*` packages**
   - All packages in `node_modules/@spfn/` are checked

3. **Check direct dependencies**
   - Only packages listed in your `package.json`
   - Skip if already scanned (e.g., `@spfn/*` packages)

4. **Look for `spfn.schemas` field**
   - Read each package's `package.json`
   - Extract schema paths if `spfn.schemas` exists

5. **Convert to absolute paths**
   - Schema paths are resolved relative to package root

**Example**:
```
your-app/
├── package.json
│   └── dependencies: { "@spfn/cms": "*", "lodash": "*" }
└── node_modules/
    ├── @spfn/
    │   ├── cms/           ✅ Scanned (official package)
    │   └── auth/          ✅ Scanned (official package)
    ├── lodash/            ❌ No `spfn` field
    └── @mycompany/
        └── spfn-plugin/   ✅ Scanned (direct dep with `spfn` field)
```

### Creating SPFN Packages

**1. Define Entities**:

```typescript
// src/entities/my-table.ts
import { pgTable, serial, text } from 'drizzle-orm/pg-core'

export const myTable = pgTable('my_table', {
  id: serial('id').primaryKey(),
  name: text('name').notNull()
})
```

**2. Configure package.json**:

```json
{
  "name": "@mycompany/spfn-analytics",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "spfn": {
    "schemas": ["./dist/entities/**/*.js"],
    "setupMessage": "📚 Next steps:\n  1. Import analytics: import { trackEvent } from '@mycompany/spfn-analytics'\n  2. Configure: See https://docs.example.com"
  }
}
```

**3. Build and Publish**:

```bash
pnpm build
pnpm publish
```

**4. Users Install**:

```bash
pnpm spfn add @mycompany/spfn-analytics
# ✅ Installs package
# ✅ Discovers schemas automatically
# ✅ Generates migrations
# ✅ Applies migrations
# ✅ Shows setup message
```

### Configuration Options

```typescript
interface DrizzleConfigOptions {
  /** Database connection URL */
  databaseUrl?: string

  /** Schema paths (supports globs like **/*.ts) */
  schema?: string | string[]

  /** Migration output directory */
  out?: string

  /** Database dialect (auto-detected if not provided) */
  dialect?: 'postgresql' | 'mysql' | 'sqlite'

  /** Working directory for package discovery */
  cwd?: string

  /** Disable automatic package schema discovery */
  disablePackageDiscovery?: boolean

  /** Only include schemas from specific package */
  packageFilter?: string
}
```

### API Reference

**`discoverPackageSchemas(cwd: string): string[]`**

Discovers schema paths from installed packages.

**`getDrizzleConfig(options?: DrizzleConfigOptions)`**

Generate Drizzle Kit configuration object.

**`generateDrizzleConfigFile(options?: DrizzleConfigOptions): string`**

Generate `drizzle.config.ts` file content.

**`detectDialect(url: string): 'postgresql' | 'mysql' | 'sqlite'`**

Auto-detect database dialect from connection URL.

## 🔧 Configuration Priority

All configuration follows the same priority order:

1. **Options parameter** (highest) - Passed to functions
2. **Environment variables** - From `.env` files
3. **Defaults** (lowest) - Based on NODE_ENV

### Pool Configuration

```bash
# Environment variables
DB_POOL_MAX=20                  # Max connections
DB_POOL_IDLE_TIMEOUT=30         # Idle timeout (seconds)
```

**Defaults**:
- Production: `max=20`, `idleTimeout=30`
- Development: `max=10`, `idleTimeout=20`

### Retry Configuration

```bash
# Environment variables
DB_RETRY_MAX=5                  # Max retry attempts
DB_RETRY_INITIAL_DELAY=100      # Initial delay (ms)
DB_RETRY_MAX_DELAY=10000        # Max delay (ms)
DB_RETRY_FACTOR=2               # Exponential factor
```

**Defaults**:
- Production: `5 retries`, `100ms initial`, `10s max`
- Development: `3 retries`, `50ms initial`, `5s max`

### Health Check Configuration

```bash
# Environment variables
DB_HEALTH_CHECK_ENABLED=true
DB_HEALTH_CHECK_INTERVAL=60000
DB_HEALTH_CHECK_RECONNECT=true
DB_HEALTH_CHECK_MAX_RETRIES=3
DB_HEALTH_CHECK_RETRY_INTERVAL=5000
```

### Reconnect Trigger (Query-Error Fast-Path)

Controls the sliding-window counter that triggers `forceReconnectDatabase()`
when live queries keep failing with connection-level errors. These knobs are
read once at module load — they are operational tuning, not per-call flips.

```bash
# Environment variables
DB_RECONNECT_ERROR_THRESHOLD=3      # Connection errors needed to trigger rebuild
DB_RECONNECT_ERROR_WINDOW_MS=10000  # Sliding window length (min 1000ms)
```

**Defaults**: 3 errors in 10 seconds. Lower the threshold for more aggressive
recovery, raise it to tolerate transient blips without rebuilding the pool.

### Monitoring Configuration

```bash
# Environment variables
DB_MONITORING_ENABLED=true      # Auto: true in dev, false in prod
DB_MONITORING_SLOW_THRESHOLD=1000
DB_MONITORING_LOG_QUERIES=false
```

## 🎯 Pattern Detection

The factory automatically detects database configuration patterns:

### Priority Order
1. **write-read**: `DATABASE_WRITE_URL` + `DATABASE_READ_URL` (recommended)
2. **single**: `DATABASE_URL` (most common)
3. **single**: `DATABASE_WRITE_URL` (write-only)
4. **none**: No configuration

### Example

```typescript
// Pattern detection is automatic
const pattern = detectDatabasePattern();

switch (pattern.type) {
  case 'write-read':
    console.log(`Write: ${pattern.write}, Read: ${pattern.read}`);
    break;
  case 'single':
    console.log(`Single: ${pattern.url}`);
    break;
  case 'none':
    console.log('No database configured');
    break;
}
```

## 🔒 Security Features

### Password Masking
Database URLs in logs have passwords masked:

```typescript
// Input:  postgresql://user:secret123@localhost:5432/mydb
// Logged: postgresql://user:***@localhost:5432/mydb
```

### Connection Validation
All connections are tested before being marked as ready:

```typescript
await db.execute('SELECT 1');  // Test query
```

## 📊 Recent Improvements (2026)

### Pool Recovery Hardening
- ✅ `forceReconnectDatabase()` public API for on-demand rebuild
- ✅ `reportDatabaseError()` + sliding-window trigger: reconnect within seconds
  instead of waiting for the periodic health check
- ✅ `isConnectionLevelError()` classifier (postgres.js codes, Node errno,
  PG SQLSTATE class 08/53300/57P0x, walks `cause`/`original`/`err`/`inner` chain)
- ✅ Atomic-swap race fixes: check-and-set on `isReconnecting` at function
  entry (single-threaded atomic), `isClosing` re-check before swap
- ✅ WeakSet dedup across error-chain re-wrapping (repo → middleware)
- ✅ `DB_RECONNECT_ERROR_THRESHOLD` / `DB_RECONNECT_ERROR_WINDOW_MS` env vars

## 📊 Earlier Improvements (2024)

### Code Quality
- ✅ Removed 186 lines of commented code
- ✅ Split manager.ts (561 → 341 lines, -39%)
- ✅ Added type-safe pattern detection
- ✅ Extracted reusable utility functions
- ✅ Reduced code duplication (DRY principle)

### Architecture
- ✅ Separated global state management
- ✅ Extracted health check logic
- ✅ Added environment variable parsing utilities
- ✅ Improved configuration builders

### Type System
- ✅ Explicit `PostgresJsDatabase<Record<string, unknown>>` type
- ✅ Fixed type compatibility across transaction modules
- ✅ Consistent schema parameter specification
- ✅ Resolved type inference issues

### Testing
- ✅ **107 comprehensive unit tests** across all modules
- ✅ **~100% code coverage** for manager module
- ✅ Mock-based testing for external dependencies
- ✅ Retry logic and backoff validation
- ✅ Health check and reconnection testing
- ✅ Pattern detection coverage

### Security
- ✅ Password masking in all logs
- ✅ Connection string sanitization

### Maintainability
- ✅ Clear module separation
- ✅ Type-safe pattern matching
- ✅ Consistent error handling
- ✅ Comprehensive documentation

## 🧪 Testing

The manager module has comprehensive unit test coverage:

### Test Files
```
config.test.ts              Pool/retry/healthCheck/monitoring config builders
connection.test.ts          Exponential-backoff retry + non-retryable detection
factory.test.ts             Pattern detection (write-read / single / none)
manager.test.ts             Lifecycle, getDatabase, closeDatabase
health-check.test.ts        Periodic check + triggerForceReconnect guards + coalescing
reconnect-trigger.test.ts   Classifier matrix + sliding window + WeakSet dedup
```

### Running Tests
```bash
# Run all manager tests
pnpm vitest run src/db/manager/__tests__

# Run with coverage
pnpm vitest run src/db/manager/__tests__ --coverage
```

### Example Test Usage
```typescript
import { initDatabase, closeDatabase, setDatabase } from '@spfn/core/db';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

describe('Database Manager', () => {
  afterEach(async () => {
    await closeDatabase();
  });

  it('should initialize database', async () => {
    const { write, read } = await initDatabase();
    expect(write).toBeDefined();
    expect(read).toBeDefined();
  });

  it('should support manual configuration', async () => {
    const client = postgres('postgresql://localhost:5432/test');
    const db = drizzle(client);

    setDatabase(db);

    const instance = getDatabase('write');
    expect(instance).toBe(db);
  });
});
```

### What's Tested
- ✅ Configuration builders with priority resolution
- ✅ Connection retry with exponential backoff
- ✅ Database pattern detection (write-read, legacy, single)
- ✅ Manager initialization and lifecycle
- ✅ Health check intervals and reconnection
- ✅ `triggerForceReconnect` guards (uninit DB, `isClosing`) and coalescing
- ✅ `reconnectAndRestore` swap-time `isClosing` abort (no leaked pool)
- ✅ `isConnectionLevelError` classifier matrix (driver / errno / SQLSTATE / cause chain)
- ✅ Sliding-window threshold, counter aging, reset on trigger
- ✅ WeakSet dedup across error-chain re-wrapping
- ✅ Pool configuration and environment variables
- ✅ Error handling and edge cases

## 🔗 Related Modules

- `../repository/` - Repository pattern implementation
- `../transaction/` - Transaction middleware
- `../schema/` - Schema helper functions
- `../../logger/` - Structured logging
- `../../env/` - Environment variable loading

## 📚 Additional Resources

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [postgres.js Documentation](https://github.com/porsager/postgres)
- [Connection Pooling Best Practices](https://node-postgres.com/features/pooling)