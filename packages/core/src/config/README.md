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
const logLevel: LogLevel = env.LOG_LEVEL;
const appUrl: string | undefined = env.SPFN_APP_URL;
```

### 설정 가져오기

```typescript
import { getEnvConfig } from '@spfn/core/config';

// 새로운 설정 객체 가져오기
const config = getEnvConfig();
console.log(config.DB_POOL_MAX);
```

### 환경변수 검증

```typescript
import { validateEnvConfig } from '@spfn/core/config';

// 애플리케이션 시작 시 검증
try {
  validateEnvConfig();
  console.log('✅ Environment configuration is valid');
} catch (error) {
  console.error('❌ Invalid environment configuration:', error);
  process.exit(1);
}
```

## Environment Variables

### Core

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `NODE_ENV` | `'development' \| 'production' \| 'test'` | `'development'` | Node.js runtime environment |

### Database

#### Connection Pool
| Variable | Type | Default (Dev/Prod) | Description |
|----------|------|-------------------|-------------|
| `DB_POOL_MAX` | `number` | `10` / `20` | Maximum connections in pool |
| `DB_POOL_IDLE_TIMEOUT` | `number` | `20` / `30` | Idle timeout in seconds |

#### Retry Configuration
| Variable | Type | Default (Dev/Prod) | Description |
|----------|------|-------------------|-------------|
| `DB_RETRY_MAX` | `number` | `3` / `5` | Maximum retry attempts |
| `DB_RETRY_INITIAL_DELAY` | `number` | `50` / `100` | Initial delay (ms) |
| `DB_RETRY_MAX_DELAY` | `number` | `5000` / `10000` | Maximum delay (ms) |
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
| `DB_MONITORING_ENABLED` | `boolean` | `true` (dev) / `false` (prod) | Enable query monitoring |
| `DB_MONITORING_SLOW_THRESHOLD` | `number` | `1000` | Slow query threshold (ms) |
| `DB_MONITORING_LOG_QUERIES` | `boolean` | `false` | Log all queries |

### Logger

#### Core
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LOG_LEVEL` | `'debug' \| 'info' \| 'warn' \| 'error' \| 'fatal'` | `'debug'` (dev) / `'info'` (prod) | Minimum log level |

#### Slack Transport (Optional)
| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `SLACK_WEBHOOK_URL` | `string` | No | Slack webhook URL |
| `SLACK_CHANNEL` | `string` | No | Slack channel |
| `SLACK_USERNAME` | `string` | No | Bot username (default: `'Logger Bot'`) |

#### Email Transport (Optional)
| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `SMTP_HOST` | `string` | No | SMTP server host |
| `SMTP_PORT` | `number` | No | SMTP server port |
| `SMTP_USER` | `string` | No | SMTP username |
| `SMTP_PASSWORD` | `string` | No | SMTP password |
| `EMAIL_FROM` | `string` | No | Sender email |
| `EMAIL_TO` | `string` | No | Recipient email(s) |

### Next.js

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `SPFN_APP_URL` | `string` | No (Yes for SSR) | Application URL |

## API Reference

### `env`

전역 환경변수 설정 객체 (지연 로드됨)

```typescript
import { env } from '@spfn/core/config';

console.log(env.DB_POOL_MAX); // number
console.log(env.LOG_LEVEL);   // LogLevel
```

### `getEnvConfig()`

새로운 환경변수 설정 객체를 반환합니다.

```typescript
import { getEnvConfig } from '@spfn/core/config';

const config = getEnvConfig();
```

### `validateEnvConfig()`

필수 환경변수 검증

```typescript
import { validateEnvConfig } from '@spfn/core/config';

validateEnvConfig(); // Throws if validation fails
```

### `resetEnvConfig()`

전역 설정 캐시 초기화 (테스트용)

```typescript
import { resetEnvConfig } from '@spfn/core/config';

beforeEach(() => {
  process.env.DB_POOL_MAX = '50';
  resetEnvConfig();
});
```

### `getSchemaByCategory(category: string)`

카테고리별 스키마 조회

```typescript
import { getSchemaByCategory } from '@spfn/core/config';

const dbVars = getSchemaByCategory('database');
console.log(dbVars.map(v => v.key));
// ['DB_POOL_MAX', 'DB_POOL_IDLE_TIMEOUT', ...]
```

### `getCategories()`

모든 카테고리 목록 반환

```typescript
import { getCategories } from '@spfn/core/config';

const categories = getCategories();
// ['core', 'database', 'logger', 'nextjs']
```

## Types

```typescript
import type {
  EnvConfig,
  CoreEnvConfig,
  DatabaseEnvConfig,
  LoggerEnvConfig,
  NextjsEnvConfig,
  NodeEnv,
  LogLevel,
} from '@spfn/core/config';
```

## Example .env File

```env
# Core
NODE_ENV=development

# Database
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30
DB_MONITORING_ENABLED=true

# Logger
LOG_LEVEL=debug
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Next.js
SPFN_APP_URL=http://localhost:3000
```

## Best Practices

1. **애플리케이션 시작 시 검증**
   ```typescript
   import { validateEnvConfig } from '@spfn/core/config';

   validateEnvConfig();
   ```

2. **전역 `env` 객체 사용**
   ```typescript
   import { env } from '@spfn/core/config';

   // 어디서든 접근 가능
   if (env.DB_MONITORING_ENABLED) {
     // ...
   }
   ```

3. **테스트에서 초기화**
   ```typescript
   import { resetEnvConfig } from '@spfn/core/config';

   afterEach(() => {
     resetEnvConfig();
   });
   ```

## Related

- [@spfn/core/env](../env/README.md) - 환경변수 로더 및 유틸리티
- [@spfn/core/logger](../logger/README.md) - 로깅 시스템
- [@spfn/core/db](../db/README.md) - 데이터베이스 관리

## License

MIT