# SPFN Environment Variables

This document lists all environment variables used in the SPFN framework.

## Table of Contents

- [API Configuration](#api-configuration)
- [Database Configuration](#database-configuration)
- [Cache/Redis Configuration](#cacheredis-configuration)
- [Server Configuration](#server-configuration)
- [Logger Configuration](#logger-configuration)

---

## API Configuration

### `SERVER_API_URL`
- **Type**: `string`
- **Required**: No
- **Default**: Falls back to `NEXT_PUBLIC_API_URL`
- **Description**: Internal API URL for server-side calls (Next.js SSR/API Routes)
- **Usage**: Server-side only (not exposed to browser)
- **Example**: `http://localhost:8791`, `http://spfn-service:8791` (k8s)
- **Location**: `packages/core/src/client/contract-client.ts`

### `NEXT_PUBLIC_API_URL`
- **Type**: `string`
- **Required**: No
- **Default**: `http://localhost:4000`
- **Description**: Public API URL for client-side calls (browser)
- **Usage**: Available in both server and client
- **Example**: `https://api.example.com`, `http://localhost:8791`
- **Location**: `packages/core/src/client/contract-client.ts`

**Priority**: `config.baseUrl` > `SERVER_API_URL` > `NEXT_PUBLIC_API_URL` > `'http://localhost:4000'`

---

## Database Configuration

### `DATABASE_URL`
- **Type**: `string` (PostgreSQL connection URL)
- **Required**: Yes (for database operations)
- **Default**: None
- **Description**: PostgreSQL database connection string
- **Example**: `postgresql://user:password@localhost:5432/dbname`
- **Location**:
  - `packages/cli/src/commands/db.ts`
  - `packages/cli/src/commands/add.ts`
  - `packages/core/src/db/drizzle.config.ts`

### `DRIZZLE_SCHEMA_PATH`
- **Type**: `string`
- **Required**: No
- **Default**: `./src/server/entities/index.ts`
- **Description**: Path to Drizzle schema files
- **Location**: `packages/core/src/db/drizzle.config.ts`

### `DRIZZLE_OUT_DIR`
- **Type**: `string`
- **Required**: No
- **Default**: `./drizzle`
- **Description**: Output directory for Drizzle migrations
- **Location**: `packages/core/src/db/drizzle.config.ts`

---

## Cache/Redis Configuration

### Single Instance Mode

#### `REDIS_URL`
- **Type**: `string`
- **Required**: No (optional if Redis not used)
- **Default**: None
- **Description**: Redis connection URL for single instance mode
- **Example**:
  - `redis://localhost:6379`
  - `rediss://secure.redis.com:6380` (TLS)
  - `redis://:password@localhost:6379` (with auth)
- **Location**: `packages/core/src/cache/redis-factory.ts`

### Read/Write Split Mode

#### `REDIS_WRITE_URL`
- **Type**: `string`
- **Required**: Yes (if using read/write split)
- **Default**: None
- **Description**: Redis master node URL for write operations
- **Example**: `redis://master:6379`
- **Location**: `packages/core/src/cache/redis-factory.ts`

#### `REDIS_READ_URL`
- **Type**: `string`
- **Required**: Yes (if using read/write split)
- **Default**: None
- **Description**: Redis replica node URL for read operations
- **Example**: `redis://replica:6379`
- **Location**: `packages/core/src/cache/redis-factory.ts`

### Sentinel Mode

#### `REDIS_SENTINEL_HOSTS`
- **Type**: `string` (comma-separated)
- **Required**: Yes (if using Sentinel)
- **Default**: None
- **Description**: Comma-separated list of Redis Sentinel hosts
- **Example**: `sentinel1:26379,sentinel2:26379,sentinel3:26379`
- **Location**: `packages/core/src/cache/redis-factory.ts`

#### `REDIS_MASTER_NAME`
- **Type**: `string`
- **Required**: Yes (if using Sentinel)
- **Default**: None
- **Description**: Redis Sentinel master name
- **Example**: `mymaster`
- **Location**: `packages/core/src/cache/redis-factory.ts`

### Cluster Mode

#### `REDIS_CLUSTER_NODES`
- **Type**: `string` (comma-separated)
- **Required**: Yes (if using Cluster)
- **Default**: None
- **Description**: Comma-separated list of Redis Cluster nodes
- **Example**: `node1:6379,node2:6379,node3:6379`
- **Location**: `packages/core/src/cache/redis-factory.ts`

### Common Redis Options

#### `REDIS_PASSWORD`
- **Type**: `string`
- **Required**: No
- **Default**: None
- **Description**: Redis authentication password
- **Location**: `packages/core/src/cache/redis-factory.ts`

#### `REDIS_TLS_REJECT_UNAUTHORIZED`
- **Type**: `string` (`'true'` | `'false'`)
- **Required**: No
- **Default**: `'true'`
- **Description**: Whether to reject unauthorized TLS connections
- **Example**: `'false'` (for self-signed certificates)
- **Location**: `packages/core/src/cache/redis-factory.ts`

---

## Server Configuration

### `NODE_ENV`
- **Type**: `string` (`'development'` | `'production'` | `'test'`)
- **Required**: No
- **Default**: Auto-set by CLI commands
- **Description**: Node.js environment mode
- **Location**: Multiple locations across codebase
- **Note**: Auto-set to `'production'` in build/start commands

### `SPFN_PORT`
- **Type**: `string` | `number`
- **Required**: No
- **Default**: Falls back to `PORT`, then `8790`
- **Description**: SPFN server port
- **Example**: `8791`
- **Location**: `packages/cli/src/commands/build.ts`, `packages/cli/src/commands/start.ts`

### `PORT`
- **Type**: `string` | `number`
- **Required**: No
- **Default**: `8790`
- **Description**: Fallback server port
- **Location**: `packages/cli/src/commands/build.ts`, `packages/cli/src/commands/start.ts`

### `SPFN_HOST`
- **Type**: `string`
- **Required**: No
- **Default**: Falls back to `HOST`, then `0.0.0.0`
- **Description**: SPFN server host
- **Example**: `localhost`, `0.0.0.0`
- **Location**: `packages/cli/src/commands/build.ts`, `packages/cli/src/commands/start.ts`

### `HOST`
- **Type**: `string`
- **Required**: No
- **Default**: `0.0.0.0`
- **Description**: Fallback server host
- **Location**: `packages/cli/src/commands/build.ts`, `packages/cli/src/commands/start.ts`

---

## Logger Configuration

### General

#### `LOGGER_ADAPTER`
- **Type**: `string` (`'pino'` | `'winston'` | `'console'`)
- **Required**: No
- **Default**: Auto-detected based on environment
- **Description**: Logger adapter to use
- **Location**: `packages/core/src/logger/adapter-factory.ts`

#### `LOGGER_FILE_ENABLED`
- **Type**: `string` (`'true'` | `'false'`)
- **Required**: No
- **Default**: `'false'`
- **Description**: Enable file logging
- **Location**: `packages/core/src/logger/config.ts`

#### `LOG_DIR`
- **Type**: `string`
- **Required**: No
- **Default**: `./logs`
- **Description**: Directory for log files
- **Location**: `packages/core/src/logger/config.ts`

### Slack Integration

#### `SLACK_WEBHOOK_URL`
- **Type**: `string`
- **Required**: No (optional if Slack not used)
- **Default**: None
- **Description**: Slack webhook URL for log notifications
- **Example**: `https://hooks.slack.com/services/T00/B00/XXX`
- **Location**: `packages/core/src/logger/config.ts`

#### `SLACK_CHANNEL`
- **Type**: `string`
- **Required**: No
- **Default**: None
- **Description**: Slack channel name
- **Example**: `#logs`, `#alerts`
- **Location**: `packages/core/src/logger/config.ts`

#### `SLACK_USERNAME`
- **Type**: `string`
- **Required**: No
- **Default**: `'Logger Bot'`
- **Description**: Slack bot username for log messages
- **Location**: `packages/core/src/logger/config.ts`

### Email Integration

#### `SMTP_HOST`
- **Type**: `string`
- **Required**: No (optional if Email not used)
- **Default**: None
- **Description**: SMTP server hostname
- **Example**: `smtp.gmail.com`
- **Location**: `packages/core/src/logger/config.ts`

#### `SMTP_PORT`
- **Type**: `string` | `number`
- **Required**: No (optional if Email not used)
- **Default**: None
- **Description**: SMTP server port
- **Example**: `587`, `465`
- **Location**: `packages/core/src/logger/config.ts`

#### `SMTP_USER`
- **Type**: `string`
- **Required**: No
- **Default**: None
- **Description**: SMTP authentication username
- **Location**: `packages/core/src/logger/config.ts`

#### `SMTP_PASSWORD`
- **Type**: `string`
- **Required**: No
- **Default**: None
- **Description**: SMTP authentication password
- **Location**: `packages/core/src/logger/config.ts`

#### `EMAIL_FROM`
- **Type**: `string`
- **Required**: No (optional if Email not used)
- **Default**: None
- **Description**: Email sender address
- **Example**: `noreply@example.com`
- **Location**: `packages/core/src/logger/config.ts`

#### `EMAIL_TO`
- **Type**: `string`
- **Required**: No (optional if Email not used)
- **Default**: None
- **Description**: Email recipient address
- **Example**: `admin@example.com`
- **Location**: `packages/core/src/logger/config.ts`

---

## Environment Variable Priority

### API URL Resolution
```
config.baseUrl (explicit)
  > SERVER_API_URL (server-side only)
    > NEXT_PUBLIC_API_URL (public/client-side)
      > 'http://localhost:4000' (fallback)
```

### Server Port Resolution
```
SPFN_PORT
  > PORT
    > 8790 (default)
```

### Server Host Resolution
```
SPFN_HOST
  > HOST
    > 0.0.0.0 (default)
```

### Redis Mode Detection
```
1. Cluster Mode: REDIS_CLUSTER_NODES exists
2. Sentinel Mode: REDIS_SENTINEL_HOSTS + REDIS_MASTER_NAME exist
3. Read/Write Split: REDIS_WRITE_URL + REDIS_READ_URL exist
4. Single Instance: REDIS_URL exists
5. No Cache: None set
```

---

## Example Configurations

### Development (.env.local)
```bash
# Database
DATABASE_URL=postgresql://spfn:spfn@localhost:5432/spfn_dev

# Redis (optional)
REDIS_URL=redis://localhost:6379

# API URLs
SERVER_API_URL=http://localhost:8790
NEXT_PUBLIC_API_URL=http://localhost:8790

# Server
NODE_ENV=development
```

### Production (Docker/K8s)
```bash
# Database
DATABASE_URL=postgresql://user:pass@db-host:5432/production_db

# Redis Cluster
REDIS_CLUSTER_NODES=node1:6379,node2:6379,node3:6379
REDIS_PASSWORD=secret

# API URLs
SERVER_API_URL=http://spfn-service:8790  # Internal k8s service
NEXT_PUBLIC_API_URL=https://api.example.com  # Public domain

# Server
NODE_ENV=production
PORT=8790
HOST=0.0.0.0

# Logging
LOG_DIR=/var/log/spfn
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SLACK_CHANNEL=#production-alerts
```

### Production (AWS EC2)
```bash
# Database
DATABASE_URL=postgresql://user:pass@rds-endpoint:5432/db

# Redis Sentinel
REDIS_SENTINEL_HOSTS=sentinel1:26379,sentinel2:26379
REDIS_MASTER_NAME=mymaster
REDIS_PASSWORD=secret

# API URLs
SERVER_API_URL=http://172.31.x.x:8790  # Internal VPC IP
NEXT_PUBLIC_API_URL=https://api.example.com  # Public domain

# Email Alerts
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=AKIAXXXXXXXX
SMTP_PASSWORD=secret
EMAIL_FROM=noreply@example.com
EMAIL_TO=admin@example.com
```

---

## Notes

### Security
- **Never commit `.env.local`** to version control
- Use **`.env.local.example`** for documentation
- Store production secrets in CI/CD secret management
- Prefix client-accessible vars with `NEXT_PUBLIC_`

### Next.js Behavior
- `NEXT_PUBLIC_*` vars are embedded in browser bundle
- Non-prefixed vars are server-only
- Changes require rebuild for browser bundle

### SPFN CLI Behavior
- `spfn build` sets `NODE_ENV=production`
- `spfn start` sets `NODE_ENV=production`
- `spfn dev` keeps current `NODE_ENV` or defaults to `development`
