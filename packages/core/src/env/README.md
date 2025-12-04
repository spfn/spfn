# @spfn/core/env - Environment Variable Management

Type-safe environment variable management with schema-based validation, parsing, and Next.js support.

## Core Components

```
env/
├── index.ts        # Module exports
├── schema.ts       # Schema definition helpers
├── registry.ts     # EnvRegistry class
├── validator.ts    # Parser functions
└── types.ts        # Type definitions (NodeEnv, LogLevel)
```

## Features

- **Schema-Based Validation**: Define environment variables with metadata and validation
- **Type-Safe Access**: Full TypeScript inference from schema definitions
- **Lazy Validation**: Proxy-based access validates at runtime
- **Rich Parsers**: String, number, boolean, URL, enum, JSON, array parsers
- **Security Parsers**: Entropy-based secret validation, password strength checks
- **Parser Composition**: Chain, fallback, and optional utilities
- **Next.js Support**: Client/server environment variable detection

---

## Quick Start

### Basic Usage

```typescript
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
console.log(env.DATABASE_URL); // string (required)
console.log(env.PORT);         // number (default: 3000)
console.log(env.DEBUG);        // boolean (default: false)
console.log(env.LOG_LEVEL);    // 'debug' | 'info' | 'warn' | 'error'
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

String environment variable.

```typescript
API_KEY: envString({
  description: 'API authentication key',
  required: true,
  sensitive: true,
  minLength: 32,
})
```

#### `envNumber(options)`

Number environment variable with automatic parsing.

```typescript
PORT: envNumber({
  description: 'Server port',
  default: 3000,
  validator: createNumberParser({ min: 1, max: 65535 }),
})
```

#### `envBoolean(options)`

Boolean environment variable.

```typescript
DEBUG: envBoolean({
  description: 'Enable debug mode',
  default: false,
})
```

#### `envUrl(options)`

URL environment variable.

```typescript
API_URL: envUrl({
  description: 'API endpoint URL',
  required: true,
  validator: parsePostgresUrl,
})
```

#### `envEnum(allowed, options)`

Enum environment variable with allowed values.

```typescript
LOG_LEVEL: envEnum(['debug', 'info', 'warn', 'error'] as const, {
  description: 'Logging level',
  default: 'info',
})
```

#### `envJson<T>(options)`

JSON environment variable with type inference.

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
| `validator` | `(value: string) => T` | Custom validation/transform function |
| `fallbackKeys` | `string[]` | Fallback environment variable keys |
| `minLength` | `number` | Minimum string length |
| `sensitive` | `boolean` | Mark as sensitive (masked in logs) |
| `examples` | `T[]` | Example values for documentation |

---

## EnvRegistry

### Creating Registry

```typescript
import { createEnvRegistry } from '@spfn/core/env';

const registry = createEnvRegistry(schema);
const env = registry.validate();
```

### Lazy Validation

The registry uses Proxy-based lazy validation - values are validated when accessed:

```typescript
const env = registry.validate(); // Only validates schema structure

// Later, when accessed:
console.log(env.DATABASE_URL); // Validates and returns value at this point
```

This allows dotenv to be loaded after registry creation.

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

// Basic non-empty string
parseString('  hello  '); // 'hello'

// With constraints
const apiKeyParser = createStringParser({
  minLength: 32,
  maxLength: 128,
  pattern: /^[A-Za-z0-9_-]+$/,
  trim: true,
});
```

### Boolean Parser

```typescript
import { parseBoolean } from '@spfn/core/env';

parseBoolean('true');  // true
parseBoolean('1');     // true
parseBoolean('yes');   // true
parseBoolean('false'); // false
parseBoolean('0');     // false
parseBoolean('no');    // false
```

### Number Parsers

```typescript
import {
  parseNumber,
  createNumberParser,
  parseInteger,
  parseFloat,
} from '@spfn/core/env';

// Basic number
parseNumber('42'); // 42

// With constraints
const portParser = createNumberParser({
  min: 1,
  max: 65535,
  integer: true,
});

// Integer shorthand
parseInteger('42', { min: 1, max: 100 });

// Float shorthand
parseFloat('0.75', { min: 0, max: 1 });
```

### URL Parsers

```typescript
import {
  parseUrl,
  createUrlParser,
  parsePostgresUrl,
  parseRedisUrl,
} from '@spfn/core/env';

// Generic URL
parseUrl('https://api.example.com');

// With protocol requirement
const httpsParser = createUrlParser('https');

// PostgreSQL URL (postgres:// or postgresql://)
parsePostgresUrl('postgres://user:pass@localhost:5432/db');

// Redis URL (redis:// or rediss://)
parseRedisUrl('redis://localhost:6379');
```

### Enum Parser

```typescript
import { parseEnum, createEnumParser } from '@spfn/core/env';

// Inline
parseEnum('info', ['debug', 'info', 'warn', 'error']);

// Reusable parser
const logLevelParser = createEnumParser(
  ['debug', 'info', 'warn', 'error'],
  true // case-insensitive
);
```

### JSON Parser

```typescript
import { parseJson, createJsonParser } from '@spfn/core/env';

// Generic JSON
const config = parseJson('{"host":"localhost","port":3000}');

// Typed JSON
interface Config {
  host: string;
  port: number;
}
const typedParser = createJsonParser<Config>();
```

### Array Parser

```typescript
import { parseArray, createArrayParser, createNumberParser } from '@spfn/core/env';

// String array
parseArray('a,b,c'); // ['a', 'b', 'c']

// With custom separator
parseArray('a|b|c', { separator: '|' }); // ['a', 'b', 'c']

// Typed array with item parser
const portsParser = createArrayParser(
  createNumberParser({ min: 1, max: 65535, integer: true })
);
portsParser('3000,4000,5000'); // [3000, 4000, 5000]
```

### Security Parsers

#### Secure Secret Parser

Validates cryptographic secrets with entropy check:

```typescript
import { createSecureSecretParser } from '@spfn/core/env';

const secretParser = createSecureSecretParser({
  minLength: 32,        // Minimum 256-bit
  minUniqueChars: 16,   // Character diversity
  minEntropy: 3.5,      // Shannon entropy (bits/char)
});

// Entropy reference:
// - Random lowercase: ~4.7 bits/char
// - Random alphanumeric: ~5.2 bits/char
// - Random printable ASCII: ~6.6 bits/char
// - "aaaaaaa...": ~0 bits/char
```

#### Password Parser

Validates password strength:

```typescript
import { createPasswordParser } from '@spfn/core/env';

const passwordParser = createPasswordParser({
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
});
```

### Parser Composition

#### `chain(...parsers)`

Chain multiple parsers sequentially:

```typescript
import { chain, parseString, createStringParser } from '@spfn/core/env';

const apiKeyParser = chain(
  parseString,
  createStringParser({ minLength: 32, pattern: /^[A-Za-z0-9_-]+$/ })
);
```

#### `withFallback(parser, fallback)`

Provide fallback value on parse failure:

```typescript
import { withFallback, parseJson } from '@spfn/core/env';

const configParser = withFallback(parseJson, { host: 'localhost', port: 3000 });
```

#### `optional(parser)`

Make parser return undefined for empty strings:

```typescript
import { optional, parseRedisUrl } from '@spfn/core/env';

const optionalRedisParser = optional(parseRedisUrl);
optionalRedisParser('');                    // undefined
optionalRedisParser('redis://localhost');   // 'redis://localhost'
```

---

## Next.js Support

### Client/Server Detection

```typescript
import { isClientAccessible, isServerOnly } from '@spfn/core/env';

isClientAccessible('NEXT_PUBLIC_API_URL');  // true
isClientAccessible('DATABASE_URL');         // false

isServerOnly('DATABASE_URL');               // true
isServerOnly('NEXT_PUBLIC_API_URL');        // false
```

### Security Warning

Registry warns when sensitive variables are client-accessible:

```typescript
// Warning: DATABASE_URL is marked as sensitive but accessible from client
NEXT_PUBLIC_DATABASE_URL: envString({
  description: 'Database URL',
  sensitive: true, // This triggers a warning
})
```

---

## Type Inference

### InferEnvType

Automatically infers types from schema:

```typescript
import type { InferEnvType } from '@spfn/core/env';

const schema = defineEnvSchema({
  DATABASE_URL: envString({ description: 'DB URL', required: true }),
  PORT: envNumber({ description: 'Port', default: 3000 }),
  DEBUG: envBoolean({ description: 'Debug' }),
});

type Env = InferEnvType<typeof schema>;
// {
//   DATABASE_URL: string;        // required: true
//   PORT: number;                // has default
//   DEBUG?: boolean | undefined; // optional
// }
```

### Type Rules

- `required: true` or `default` provided → Required field
- `required: false` or not specified → Optional field (`| undefined`)

---

## Types

### NodeEnv

```typescript
type NodeEnv = 'local' | 'development' | 'staging' | 'production' | 'test';
```

### LogLevel

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
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
  envUrl,
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
  HOST: envString({
    description: 'Server host',
    default: '0.0.0.0',
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
  LOG_LEVEL: envEnum(['debug', 'info', 'warn', 'error', 'fatal'] as const, {
    description: 'Log level',
    default: 'info',
  }),

  // Optional Redis
  REDIS_URL: envUrl({
    description: 'Redis connection URL (optional)',
    required: false,
  }),

  // Feature flags
  DEBUG: envBoolean({
    description: 'Enable debug mode',
    default: false,
  }),
});

const registry = createEnvRegistry(schema);
export const env = registry.validate();
export type Env = typeof env;
```

Usage:

```typescript
import { env } from '@/config/env';

// Full type safety
const dbUrl = env.DATABASE_URL;     // string
const port = env.PORT;              // number
const isDebug = env.DEBUG;          // boolean
const nodeEnv = env.NODE_ENV;       // 'development' | 'staging' | 'production' | 'test'
const redisUrl = env.REDIS_URL;     // string | undefined
```

---

## Best Practices

### 1. Centralize Environment Configuration

```typescript
// src/config/env.ts - Single source of truth
export const env = registry.validate();
```

### 2. Use Descriptive Descriptions

```typescript
DATABASE_URL: envString({
  description: 'PostgreSQL connection URL for primary database',
  // Not: 'DB URL'
})
```

### 3. Mark Sensitive Variables

```typescript
API_SECRET: envString({
  sensitive: true, // Masked in logs
})
```

### 4. Provide Fallback Keys for Migrations

```typescript
DATABASE_URL: envString({
  required: true,
  fallbackKeys: ['DB_URL', 'POSTGRES_URL'], // Legacy support
})
```

### 5. Use Strong Validators for Secrets

```typescript
SESSION_SECRET: envString({
  validator: createSecureSecretParser({
    minLength: 32,
    minEntropy: 3.5,
  }),
})
```

---

## Troubleshooting

### Environment variable not found

**Cause:** Variable not set or dotenv not loaded

**Solution:**
1. Check `.env` file exists and contains the variable
2. Ensure dotenv is loaded before accessing env
3. Check for typos in variable name

### Validation failed

**Cause:** Value doesn't meet validation constraints

**Solution:**
1. Check error message for specific constraint failure
2. Verify value format matches expected type
3. Check min/max constraints

### Sensitive variable exposed to client

**Cause:** NEXT_PUBLIC_ prefix on sensitive variable

**Solution:**
Remove NEXT_PUBLIC_ prefix from sensitive variables:
```typescript
// Wrong
NEXT_PUBLIC_API_SECRET: envString({ sensitive: true })

// Correct
API_SECRET: envString({ sensitive: true })
```

---

## Related

- [@spfn/core/config](../config/README.md) - Application configuration
- [@spfn/core/logger](../logger/README.md) - Logging infrastructure
- [@spfn/core](../../README.md) - Main package documentation