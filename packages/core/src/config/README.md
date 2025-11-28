# @spfn/core/config

중앙화된 환경변수 설정 관리 모듈입니다. 타입 안전성, 검증, 문서화를 제공합니다.

## Features

- ✅ **타입 안전**: TypeScript를 통한 완전한 타입 추론
- ✅ **중앙 관리**: 모든 환경변수를 한 곳에서 정의
- ✅ **기본값 지원**: 환경별 스마트 기본값
- ✅ **검증**: 자동 타입 변환 및 유효성 검사
- ✅ **문서화**: 각 변수에 대한 설명, 예시, 카테고리
- ✅ **카테고리화**: 논리적 그룹으로 환경변수 구조화

## Installation

```bash
npm install @spfn/core
```

## Quick Start

### 기본 사용법

```typescript
import { env } from '@spfn/core/config';

// 타입 안전한 환경변수 접근
const poolMax: number = env.DB_POOL_MAX;
const logLevel: 'debug' | 'info' | 'warn' | 'error' | 'fatal' = env.SPFN_LOG_LEVEL;
const appUrl: string | undefined = env.SPFN_APP_URL;
const apiUrl: string = env.SPFN_API_URL; // Required
```

### 스키마와 Registry 접근

```typescript
import { registry } from '@spfn/core/config';
import { coreEnvSchema } from '@spfn/core/config/schema';

// 환경변수 검증 및 가져오기
const config = registry.validate();
console.log(config.DB_POOL_MAX);

// 스키마 정보 접근
console.log(coreEnvSchema.DB_POOL_MAX.description);
console.log(coreEnvSchema.DB_POOL_MAX.default);
```

## Environment Variables

### Core

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `NODE_ENV` | `'local' \| 'development' \| 'production' \| 'test'` | `'local'` | Node.js runtime environment |

### Database

#### Connection URLs
| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `DATABASE_URL` | `string` | No | Primary database connection URL |
| `DATABASE_WRITE_URL` | `string` | No | Write database URL (master-replica) |
| `DATABASE_READ_URL` | `string` | No | Read database URL (master-replica) |
| `DATABASE_REPLICA_URL` | `string` | No | Legacy replica database URL |

#### Connection Pool
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DB_POOL_MAX` | `number` | `10` | Maximum connections in pool |
| `DB_POOL_IDLE_TIMEOUT` | `number` | `30` | Idle timeout in seconds |

#### Retry Configuration
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DB_RETRY_MAX` | `number` | `3` | Maximum retry attempts |
| `DB_RETRY_INITIAL_DELAY` | `number` | `100` | Initial delay (ms) |
| `DB_RETRY_MAX_DELAY` | `number` | `10000` | Maximum delay (ms) |
| `DB_RETRY_FACTOR` | `number` | `2` | Backoff factor |

#### Health Check
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DB_HEALTH_CHECK_ENABLED` | `boolean` | `true` | Enable health checks |
| `DB_HEALTH_CHECK_INTERVAL` | `number` | `60000` | Check interval (ms) |
| `DB_HEALTH_CHECK_RECONNECT` | `boolean` | `true` | Reconnect on failure |
| `DB_HEALTH_CHECK_MAX_RETRIES` | `number` | `3` | Max retry attempts |
| `DB_HEALTH_CHECK_RETRY_INTERVAL` | `number` | `5000` | Retry interval (ms) |

#### Monitoring
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DB_MONITORING_ENABLED` | `boolean` | `false` | Enable query monitoring |
| `DB_MONITORING_SLOW_THRESHOLD` | `number` | `1000` | Slow query threshold (ms) |
| `DB_MONITORING_LOG_QUERIES` | `boolean` | `false` | Log all queries |

#### Transaction
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `TRANSACTION_TIMEOUT` | `number` | `30000` | Transaction timeout (ms) |

#### Development
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

## API Reference

### `env`

전역 환경변수 설정 객체 - `registry.validate()`의 결과

```typescript
import { env } from '@spfn/core/config';

console.log(env.DB_POOL_MAX); // number
console.log(env.SPFN_LOG_LEVEL); // 'debug' | 'info' | 'warn' | 'error' | 'fatal'
console.log(env.SPFN_API_URL); // string (required)
```

### `registry`

환경변수 레지스트리 객체

```typescript
import { registry } from '@spfn/core/config';

// 환경변수 검증 및 가져오기
const config = registry.validate();
console.log(config.DB_POOL_MAX);
```

### `coreEnvSchema`

Core 패키지의 환경변수 스키마 정의

```typescript
import { coreEnvSchema } from '@spfn/core/config/schema';

// 스키마 정보 접근
console.log(coreEnvSchema.DB_POOL_MAX.description);
console.log(coreEnvSchema.DB_POOL_MAX.default);
console.log(coreEnvSchema.DB_POOL_MAX.examples);
```

## Example .env File

```env
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

## Best Practices

1. **전역 `env` 객체 사용**
   ```typescript
   import { env } from '@spfn/core/config';

   // 타입 안전한 환경변수 접근
   if (env.DB_MONITORING_ENABLED) {
     console.log(`Pool size: ${env.DB_POOL_MAX}`);
   }
   ```

2. **스키마 정보 활용**
   ```typescript
   import { coreEnvSchema } from '@spfn/core/config/schema';

   // 환경변수 설명 및 기본값 확인
   console.log(coreEnvSchema.DB_POOL_MAX.description);
   console.log(coreEnvSchema.DB_POOL_MAX.default); // 10
   ```

3. **Registry로 검증**
   ```typescript
   import { registry } from '@spfn/core/config';

   try {
     const config = registry.validate();
     console.log('✅ Environment configuration is valid');
   } catch (error) {
     console.error('❌ Invalid configuration:', error);
     process.exit(1);
   }
   ```

## Related

- [@spfn/core/env](../env/README.md) - 환경변수 로더 및 유틸리티
- [@spfn/core/logger](../logger/README.md) - 로깅 시스템
- [@spfn/core/db](../db/README.md) - 데이터베이스 관리

## License

MIT