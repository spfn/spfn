# SPFN Database Manager

Database connection management with support for Primary + Replica pattern, health checks, and automatic reconnection.

## 📁 Architecture

```
manager/
├── manager.ts (341줄)         # Core database manager
├── global-state.ts (126줄)    # Global state management
├── health-check.ts (198줄)    # Health check & reconnection
├── config.ts (289줄)          # Configuration & utilities
├── factory.ts (304줄)         # Database factory with pattern detection
├── connection.ts (111줄)      # Connection logic with retry
├── config-generator.ts (127줄) # Drizzle Kit config generator
└── index.ts (22줄)            # Public API exports
```

## 🏗️ Module Responsibilities

### manager.ts (Core API)
Main entry point for database operations:
- `initDatabase()` - Initialize database with auto-detection
- `getDatabase()` - Get database instance (read/write)
- `setDatabase()` - Set database instance (testing)
- `closeDatabase()` - Gracefully close connections
- `getDatabaseInfo()` - Get connection info (debugging)
- `getDatabaseMonitoringConfig()` - Get monitoring config

### global-state.ts (State Management)
Global state management using `globalThis`:
- Singleton instance accessors (get/set)
- Persistent state across module reloads
- Type-safe global declarations
- Support for write/read separation

### health-check.ts (Monitoring)
Automatic health monitoring and recovery:
- `startHealthCheck()` - Periodic connection verification
- `stopHealthCheck()` - Stop health checks
- Automatic reconnection with exponential backoff
- Configurable intervals and retry limits

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

**Legacy Format** (backward compatibility):
```bash
DATABASE_URL=postgresql://primary:5432/mydb
DATABASE_REPLICA_URL=postgresql://replica:5432/mydb
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
2. **legacy**: `DATABASE_URL` + `DATABASE_REPLICA_URL` (backward compatibility)
3. **single**: `DATABASE_URL` (most common)
4. **single**: `DATABASE_WRITE_URL` (write-only)
5. **none**: No configuration

### Example

```typescript
// Pattern detection is automatic
const pattern = detectDatabasePattern();

switch (pattern.type) {
  case 'write-read':
    console.log(`Write: ${pattern.write}, Read: ${pattern.read}`);
    break;
  case 'legacy':
    console.log(`Primary: ${pattern.primary}, Replica: ${pattern.replica}`);
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

## 📊 Recent Improvements (2024)

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

### Security
- ✅ Password masking in all logs
- ✅ Connection string sanitization

### Maintainability
- ✅ Clear module separation
- ✅ Type-safe pattern matching
- ✅ Consistent error handling
- ✅ Comprehensive documentation

## 🧪 Testing

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