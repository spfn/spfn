# Environment

Type-safe environment variable management with schema-based validation.

## Quick Start

```typescript
// src/config/env.ts
import {
    defineEnvSchema,
    envString,
    envNumber,
    envBoolean,
    envEnum,
    createEnvRegistry,
    parsePostgresUrl,
} from '@spfn/core/env';

// 1. Define schema
const schema = defineEnvSchema({
    DATABASE_URL: envString({
        description: 'PostgreSQL connection URL',
        required: true,
        sensitive: true,
        validator: parsePostgresUrl,
    }),
    PORT: envNumber({
        description: 'Server port',
        default: 3000,
    }),
    DEBUG: envBoolean({
        description: 'Enable debug mode',
        default: false,
    }),
    LOG_LEVEL: envEnum(['debug', 'info', 'warn', 'error'] as const, {
        description: 'Logging level',
        default: 'info',
    }),
});

// 2. Create registry and validate
const registry = createEnvRegistry(schema);
export const env = registry.validate();

// 3. Use with full type safety
env.DATABASE_URL  // string (required)
env.PORT          // number (default: 3000)
env.DEBUG         // boolean (default: false)
env.LOG_LEVEL     // 'debug' | 'info' | 'warn' | 'error'
```

---

## Schema Definition

### `defineEnvSchema(schema)`

Define environment variable schema with auto-filled keys.

```typescript
const schema = defineEnvSchema({
    API_KEY: envString({ description: 'API key', required: true }),
    // Automatically adds key: 'API_KEY'
});
```

### Schema Type Helpers

#### `envString(options)`

```typescript
API_KEY: envString({
    description: 'API authentication key',
    required: true,
    sensitive: true,
    minLength: 32,
})
```

#### `envNumber(options)`

```typescript
PORT: envNumber({
    description: 'Server port',
    default: 3000,
    validator: createNumberParser({ min: 1, max: 65535 }),
})
```

#### `envBoolean(options)`

```typescript
DEBUG: envBoolean({
    description: 'Enable debug mode',
    default: false,
})
// Parses: 'true', '1', 'yes' → true
// Parses: 'false', '0', 'no' → false
```

#### `envUrl(options)`

```typescript
API_URL: envUrl({
    description: 'API endpoint URL',
    required: true,
})
```

#### `envEnum(allowed, options)`

```typescript
LOG_LEVEL: envEnum(['debug', 'info', 'warn', 'error'] as const, {
    description: 'Logging level',
    default: 'info',
})
```

#### `envJson<T>(options)`

```typescript
CONFIG: envJson<{ host: string; port: number }>({
    description: 'JSON configuration',
    required: true,
})
```

### Schema Options

| Option | Type | Description |
|--------|------|-------------|
| `description` | `string` | Variable description |
| `required` | `boolean` | Whether variable is required |
| `default` | `T` | Default value if not set |
| `validator` | `(value: string) => T` | Custom validation/transform |
| `fallbackKeys` | `string[]` | Fallback environment variable keys |
| `minLength` | `number` | Minimum string length |
| `sensitive` | `boolean` | Mark as sensitive (masked in logs) |

---

## EnvRegistry

### Creating Registry

```typescript
import { createEnvRegistry } from '@spfn/core/env';

const registry = createEnvRegistry(schema);
const env = registry.validate();
```

### Lazy Validation

Values are validated when accessed (Proxy-based):

```typescript
const env = registry.validate();

// Later, when accessed:
console.log(env.DATABASE_URL); // Validates at this point
```

### Fallback Keys

Support legacy environment variable names:

```typescript
DATABASE_URL: envString({
    description: 'Database URL',
    required: true,
    fallbackKeys: ['DB_URL', 'POSTGRES_URL'],
})
```

---

## Parsers

### String Parsers

```typescript
import { parseString, createStringParser } from '@spfn/core/env';

parseString('  hello  '); // 'hello'

const apiKeyParser = createStringParser({
    minLength: 32,
    maxLength: 128,
    pattern: /^[A-Za-z0-9_-]+$/,
});
```

### Number Parsers

```typescript
import { parseNumber, createNumberParser, parseInteger } from '@spfn/core/env';

parseNumber('42'); // 42

const portParser = createNumberParser({
    min: 1,
    max: 65535,
    integer: true,
});
```

### URL Parsers

```typescript
import { parseUrl, parsePostgresUrl, parseRedisUrl } from '@spfn/core/env';

parseUrl('https://api.example.com');
parsePostgresUrl('postgres://user:pass@localhost:5432/db');
parseRedisUrl('redis://localhost:6379');
```

### Enum Parser

```typescript
import { parseEnum, createEnumParser } from '@spfn/core/env';

parseEnum('info', ['debug', 'info', 'warn', 'error']);

const logLevelParser = createEnumParser(
    ['debug', 'info', 'warn', 'error'],
    true // case-insensitive
);
```

### Array Parser

```typescript
import { parseArray, createArrayParser } from '@spfn/core/env';

parseArray('a,b,c'); // ['a', 'b', 'c']
parseArray('a|b|c', { separator: '|' }); // ['a', 'b', 'c']

const portsParser = createArrayParser(
    createNumberParser({ min: 1, max: 65535, integer: true })
);
portsParser('3000,4000,5000'); // [3000, 4000, 5000]
```

### Security Parsers

```typescript
import { createSecureSecretParser, createPasswordParser } from '@spfn/core/env';

// Entropy-based secret validation
const secretParser = createSecureSecretParser({
    minLength: 32,
    minUniqueChars: 16,
    minEntropy: 3.5,
});

// Password strength validation
const passwordParser = createPasswordParser({
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecial: true,
});
```

### Parser Composition

```typescript
import { chain, withFallback, optional } from '@spfn/core/env';

// Chain parsers
const apiKeyParser = chain(
    parseString,
    createStringParser({ minLength: 32 })
);

// Fallback value
const configParser = withFallback(parseJson, { host: 'localhost' });

// Optional (returns undefined for empty)
const optionalRedisParser = optional(parseRedisUrl);
```

---

## Environment File Loading

### SPFN Server

```typescript
import { loadEnv } from '@spfn/core/env/loader';

// 기본 사용 (NODE_ENV 자동 감지)
loadEnv();

// 특정 환경 지정
loadEnv({ nodeEnv: 'production' });

// 서버 레이어 제외 (Next.js 클라이언트용)
loadEnv({ server: false });
```

### Loading Priority (5-Layer)

`NODE_ENV`에 따라 동적으로 파일 목록이 결정됩니다 (나중 파일이 덮어씀):

1. `.env` - 공통 기본값 (committed)
2. `.env.{NODE_ENV}` - 환경별 오버라이드 (committed)
3. `.env.local` - Next.js용 로컬 오버라이드 (gitignored, **test에서 스킵**)
4. `.env.{NODE_ENV}.local` - 환경별 시크릿 (gitignored)
5. `.env.server` - 서버 전용 (gitignored, 시크릿 포함)

> **Important:** `.env.local`은 Next.js용입니다. 서버 전용 시크릿(`DATABASE_URL` 등)은 반드시 `.env.server`에 넣으세요.

### Options

```typescript
loadEnv({
    cwd: '/path/to/project',  // 프로젝트 루트 (default: process.cwd())
    nodeEnv: 'production',     // NODE_ENV 지정 (default: process.env.NODE_ENV || 'local')
    server: true,              // 서버 전용 파일 포함 (default: true)
    debug: true,               // 로드된 파일 로깅 (default: false)
    override: false,           // 기존 process.env 덮어쓰기 (default: false)
});

// Load once (prevent duplicate calls)
import { loadEnvOnce } from '@spfn/core/env/loader';
loadEnvOnce();
```

---

## Security Separation (Next.js + SPFN)

### File Structure

```
project/
├── .env                      # 공통 기본값 (committed)
├── .env.production           # production 오버라이드 (committed)
├── .env.local                # Next.js용 로컬 오버라이드 (gitignored)
├── .env.production.local     # production 시크릿 (gitignored)
└── .env.server               # 서버 전용 (gitignored, 시크릿 포함)
```

### Which File for What?

| 환경변수 | 파일 | 이유 |
|----------|------|------|
| `NODE_ENV`, `SPFN_LOG_LEVEL` | `.env` | 모든 환경 공통, 비민감 |
| `SPFN_API_URL` (production) | `.env.production` | 환경별 비민감 설정 |
| `NEXT_PUBLIC_*` | `.env.local` | Next.js 클라이언트용, 브라우저 노출 OK |
| `SPFN_APP_URL` | `.env.local` | Next.js에서 사용하는 로컬 설정 |
| `DB_POOL_MAX` | `.env.server` | 서버 전용, 비민감 |
| `DATABASE_URL` | `.env.server` | 서버 전용, **민감정보** |
| `SESSION_SECRET` | `.env.server` | 서버 전용, **민감정보** |

> **Rule:** `.env.local`은 Next.js용입니다. `DATABASE_URL`, `SESSION_SECRET` 등 서버 전용 시크릿은 `.env.server`에 넣으세요.

### Schema with `nextjs` Option

```typescript
DATABASE_URL: envString({
    description: 'PostgreSQL connection URL',
    required: true,
    sensitive: true,
    nextjs: false,  // SPFN 서버에서만 사용 → .env.server
}),

SPFN_API_URL: envString({
    description: 'Backend API URL',
    required: true,
    nextjs: true,   // Next.js에서도 사용 → .env 또는 .env.local
}),
```

---

## Type Inference

```typescript
import type { InferEnvType } from '@spfn/core/env';

const schema = defineEnvSchema({
    DATABASE_URL: envString({ required: true }),
    PORT: envNumber({ default: 3000 }),
    DEBUG: envBoolean({}),
});

type Env = InferEnvType<typeof schema>;
// {
//   DATABASE_URL: string;        // required
//   PORT: number;                // has default
//   DEBUG?: boolean | undefined; // optional
// }
```

---

## Complete Example

```typescript
// src/config/env.ts
import {
    defineEnvSchema,
    envString,
    envNumber,
    envBoolean,
    envEnum,
    createEnvRegistry,
    parsePostgresUrl,
    createSecureSecretParser,
    createNumberParser,
} from '@spfn/core/env';

const schema = defineEnvSchema({
    // Database
    DATABASE_URL: envString({
        description: 'PostgreSQL connection URL',
        required: true,
        sensitive: true,
        validator: parsePostgresUrl,
    }),

    // Server
    PORT: envNumber({
        description: 'Server port',
        default: 3000,
        validator: createNumberParser({ min: 1, max: 65535, integer: true }),
    }),

    // Security
    SESSION_SECRET: envString({
        description: 'Session encryption secret',
        required: true,
        sensitive: true,
        validator: createSecureSecretParser({ minLength: 32 }),
    }),

    // Environment
    NODE_ENV: envEnum(['local', 'development', 'staging', 'production', 'test'] as const, {
        description: 'Node environment',
        default: 'local',
    }),

    // Logging
    LOG_LEVEL: envEnum(['debug', 'info', 'warn', 'error'] as const, {
        description: 'Log level',
        default: 'info',
    }),

    // Optional
    REDIS_URL: envString({
        description: 'Redis connection URL',
        required: false,
    }),

    DEBUG: envBoolean({
        description: 'Enable debug mode',
        default: false,
    }),
});

const registry = createEnvRegistry(schema);
export const env = registry.validate();
export type Env = typeof env;
```

---

## Best Practices

```typescript
// 1. Centralize in single file
// src/config/env.ts

// 2. Use descriptive descriptions
DATABASE_URL: envString({
    description: 'PostgreSQL connection URL for primary database',
})

// 3. Mark sensitive variables
API_SECRET: envString({
    sensitive: true,
})

// 4. Provide fallback keys for migrations
DATABASE_URL: envString({
    fallbackKeys: ['DB_URL', 'POSTGRES_URL'],
})

// 5. Use strong validators for secrets
SESSION_SECRET: envString({
    validator: createSecureSecretParser({ minLength: 32, minEntropy: 3.5 }),
})
```
