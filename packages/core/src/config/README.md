# @spfn/core/config - Configuration Module

Centralized environment variable configuration with type safety, validation, and documentation.

## Core Components

```
config/
├── index.ts        # Module exports (env, envSchema)
└── schema.ts       # Environment variable schema definition
```

## Features

- **Type-Safe**: Full TypeScript inference from schema
- **Centralized**: All environment variables defined in one place
- **Default Values**: Smart defaults per environment
- **Validation**: Automatic type conversion and validation
- **Documentation**: Description, examples, and categories for each variable

---

## Quick Start

### Basic Usage

```typescript
import { env } from '@spfn/core/config';

// Type-safe environment variable access
const poolMax: number = env.DB_POOL_MAX;
const logLevel: 'debug' | 'info' | 'warn' | 'error' | 'fatal' = env.SPFN_LOG_LEVEL;
const appUrl: string | undefined = env.SPFN_APP_URL;
const apiUrl: string = env.SPFN_API_URL; // Required
```

### Accessing Schema Information

```typescript
import { envSchema } from '@spfn/core/config';

// Access schema metadata
console.log(envSchema.DB_POOL_MAX.description);
console.log(envSchema.DB_POOL_MAX.default);
console.log(envSchema.DB_POOL_MAX.examples);
```

---

## Exports

| Export | Type | Description |
|--------|------|-------------|
| `env` | `object` | Validated environment configuration object |
| `envSchema` | `object` | Environment variable schema definition |

---

## Environment Variables

### Core

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `NODE_ENV` | `'local' \| 'development' \| 'production' \| 'test'` | `'local'` | Node.js runtime environment |

### Database - Connection URLs

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `DATABASE_URL` | `string` | No | Primary database connection URL |
| `DATABASE_WRITE_URL` | `string` | No | Write database URL (master-replica) |
| `DATABASE_READ_URL` | `string` | No | Read database URL (master-replica) |

### Database - Connection Pool

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DB_POOL_MAX` | `number` | `10` | Maximum connections in pool |
| `DB_POOL_IDLE_TIMEOUT` | `number` | `30` | Idle timeout in seconds |

### Database - Retry Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DB_RETRY_MAX` | `number` | `3` | Maximum retry attempts |
| `DB_RETRY_INITIAL_DELAY` | `number` | `100` | Initial delay (ms) |
| `DB_RETRY_MAX_DELAY` | `number` | `10000` | Maximum delay (ms) |
| `DB_RETRY_FACTOR` | `number` | `2` | Backoff factor |

### Database - Health Check

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DB_HEALTH_CHECK_ENABLED` | `boolean` | `true` | Enable health checks |
| `DB_HEALTH_CHECK_INTERVAL` | `number` | `60000` | Check interval (ms) |
| `DB_HEALTH_CHECK_RECONNECT` | `boolean` | `true` | Reconnect on failure |
| `DB_HEALTH_CHECK_MAX_RETRIES` | `number` | `3` | Max retry attempts |
| `DB_HEALTH_CHECK_RETRY_INTERVAL` | `number` | `5000` | Retry interval (ms) |

### Database - Monitoring

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DB_MONITORING_ENABLED` | `boolean` | `false` | Enable query monitoring |
| `DB_MONITORING_SLOW_THRESHOLD` | `number` | `1000` | Slow query threshold (ms) |
| `DB_MONITORING_LOG_QUERIES` | `boolean` | `false` | Log all queries |

### Database - Transaction

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `TRANSACTION_TIMEOUT` | `number` | `30000` | Transaction timeout (ms) |

### Database - Development

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DB_DEBUG_TRACE` | `boolean` | `false` | Enable detailed debug tracing |

### Drizzle ORM

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DRIZZLE_SCHEMA_PATH` | `string` | `'./src/server/entities/config.ts'` | Path to Drizzle schema |
| `DRIZZLE_OUT_DIR` | `string` | `'./drizzle'` | Output directory for migrations |

### Logger

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SPFN_LOG_LEVEL` | `'debug' \| 'info' \| 'warn' \| 'error' \| 'fatal'` | `'info'` | Minimum log level |

### Cache (Redis/Valkey)

#### Single Instance

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `CACHE_URL` | `string` | No | Single Redis/Valkey instance URL |
| `CACHE_PASSWORD` | `string` | No | Authentication password |

#### Master-Replica Pattern

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `CACHE_WRITE_URL` | `string` | No | Master Redis URL for writes |
| `CACHE_READ_URL` | `string` | No | Replica Redis URL for reads |

#### Sentinel Pattern

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `CACHE_SENTINEL_HOSTS` | `string` | No | Comma-separated Sentinel hosts |
| `CACHE_MASTER_NAME` | `string` | No | Sentinel master name |

#### Cluster Pattern

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `CACHE_CLUSTER_NODES` | `string` | No | Comma-separated cluster nodes |

#### Security

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CACHE_TLS_REJECT_UNAUTHORIZED` | `boolean` | `true` | Verify TLS certificates |

### Next.js

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `SPFN_API_URL` | `string` | **Yes** | Next.js API URL (client-side calls) |
| `SPFN_APP_URL` | `string` | No | Application URL (server-side calls) |

---

## Example .env File

```bash
# Core
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30
DB_MONITORING_ENABLED=true
TRANSACTION_TIMEOUT=30000

# Drizzle ORM
DRIZZLE_SCHEMA_PATH=./src/server/entities/config.ts
DRIZZLE_OUT_DIR=./drizzle

# Logger
SPFN_LOG_LEVEL=debug

# Cache (Redis/Valkey)
CACHE_URL=redis://localhost:6379
CACHE_PASSWORD=your-redis-password

# Next.js (Required)
SPFN_API_URL=http://localhost:3000
SPFN_APP_URL=http://localhost:3000
```

---

## Best Practices

### 1. Use the Global `env` Object

```typescript
import { env } from '@spfn/core/config';

// Type-safe environment variable access
if (env.DB_MONITORING_ENABLED) {
    console.log(`Pool size: ${env.DB_POOL_MAX}`);
}
```

### 2. Access Schema Information

```typescript
import { envSchema } from '@spfn/core/config';

// View environment variable description and defaults
console.log(envSchema.DB_POOL_MAX.description);
console.log(envSchema.DB_POOL_MAX.default); // 10
```

### 3. Validate at Startup

The `env` export automatically validates environment variables on import. If validation fails, an error will be thrown at startup.

```typescript
// This will throw if required variables are missing
import { env } from '@spfn/core/config';

// If we reach here, all required variables are valid
console.log('Environment configuration is valid');
```

---

## Related

- [@spfn/core/env](../env/README.md) - Environment variable loader and utilities
- [@spfn/core/logger](../logger/README.md) - Logging system
- [@spfn/core/db](../db/README.md) - Database management