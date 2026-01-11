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

loadEnv();  // Loads .env, .env.local, .env.server, .env.server.local
```

### Loading Priority

1. `.env` - 기본값
2. `.env.local` - 로컬 오버라이드
3. `.env.server` - 서버 전용 기본값
4. `.env.server.local` - 서버 전용 민감정보

### Options

```typescript
loadEnv({
    cwd: '/path/to/project',
    debug: true,
    override: false,
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
├── .env                  # 기본값 (커밋 O)
├── .env.local            # Next.js용 (커밋 X)
├── .env.server           # SPFN 전용 기본값 (커밋 O)
└── .env.server.local     # SPFN 전용 민감정보 (커밋 X)
```

### Which File for What?

| 환경변수 | 파일 | 이유 |
|----------|------|------|
| `NEXT_PUBLIC_*` | `.env.local` | 브라우저 노출 OK |
| `SPFN_API_URL` | `.env.local` | Next.js에서 사용 |
| `DATABASE_URL` | `.env.server.local` | SPFN 전용, 민감정보 |
| `SESSION_SECRET` | `.env.server.local` | SPFN 전용, 민감정보 |

### Schema with `nextjs` Option

```typescript
DATABASE_URL: envString({
    description: 'PostgreSQL connection URL',
    required: true,
    sensitive: true,
    nextjs: false,  // SPFN 서버에서만 사용
}),

SPFN_API_URL: envString({
    description: 'Backend API URL',
    required: true,
    nextjs: true,   // Next.js에서도 사용
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
    NODE_ENV: envEnum(['development', 'staging', 'production', 'test'] as const, {
        description: 'Node environment',
        default: 'development',
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
