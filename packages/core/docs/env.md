# Environment

Type-safe environment variable management.

## Define Environment

```typescript
// src/server/env.ts
import { defineEnv } from '@spfn/core/env';

export const env = defineEnv({
    // Required
    DATABASE_URL: { type: 'string' },
    JWT_SECRET: { type: 'string' },

    // Optional with default
    PORT: { type: 'number', default: 8790 },
    NODE_ENV: { type: 'string', default: 'development' },

    // Boolean
    DEBUG: { type: 'boolean', default: false },

    // Optional (no default)
    REDIS_URL: { type: 'string', optional: true },
});
```

## Usage

```typescript
import { env } from './env';

// Type-safe access
const dbUrl = env.DATABASE_URL;    // string
const port = env.PORT;             // number
const debug = env.DEBUG;           // boolean
const redis = env.REDIS_URL;       // string | undefined
```

## Types

| Type | Description | Example |
|------|-------------|---------|
| `string` | String value | `'production'` |
| `number` | Parsed number | `8790` |
| `boolean` | `'true'/'1'` → true | `true` |

## Validation

```typescript
// Throws on startup if required variable is missing
const env = defineEnv({
    API_KEY: { type: 'string' }  // Required
});

// Error: "Missing required environment variable: API_KEY"
```

## Best Practices

```typescript
// 1. Define all env vars in one file
// src/server/env.ts

// 2. Use type-safe defaults
PORT: { type: 'number', default: 8790 }

// 3. Mark optional vars explicitly
SENTRY_DSN: { type: 'string', optional: true }

// 4. Validate on startup
import './env';  // Import early to catch errors
```
