---
title: "Environment Variables"
description: "Learn how to manage environment variables with type-safe validation and namespace support in Superfunction"
order: 2
available: true
---

# Environment Variables

Superfunction provides a robust environment variable management system with Next.js-style file loading, type-safe validation, and namespace support for modular configuration.

## Features

- **Next.js-Style Loading** - Automatic `.env` file loading with priority hierarchy
- **Namespace Support** - Separate configs for packages, features, or services
- **Type-Safe Validation** - Parse and validate values with built-in validators
- **Schema-Based Management** - Centralized schema definition with metadata (NEW)
- **Auto Documentation** - Generate docs and .env.example automatically (NEW)
- **Validation System** - Comprehensive validation with warnings (NEW)
- **Singleton Pattern** - Load once, use everywhere
- **Test Isolation** - Special handling for test environments
- **Debug Mode** - Detailed logging for troubleshooting

## Quick Start

### Basic Usage

```typescript
import { loadEnvironment, getEnvVar } from '@spfn/core/env';

// Load environment variables once at app startup
loadEnvironment();

// Get variables with type safety
const port = getEnvVar<number>('PORT', {
    default: 3000,
    validator: createNumberParser({ min: 1, max: 65535, integer: true })
});

const apiUrl = getEnvVar<string>('API_URL', {
    required: true,
    validator: createUrlParser('https')
});
```

### Schema-Based Usage (Recommended)

For larger applications, use schema-based management for better organization and automatic documentation:

```typescript
import {
    defineEnvSchema,
    createEnvRegistry,
    loadEnvironment,
    envString,
    envNumber,
    parsePostgresUrl,
    createNumberParser,
} from '@spfn/core/env';

// 1. Define schema with metadata
const schema = defineEnvSchema({
    DATABASE_URL: {
        ...envString({
            description: 'PostgreSQL database connection',
            required: true,
            validator: parsePostgresUrl,
            category: 'database',
            sensitive: true,
        }),
        key: 'DATABASE_URL',
    },
    PORT: {
        ...envNumber({
            description: 'Server port number',
            default: 3000,
            validator: createNumberParser({ min: 1, max: 65535 }),
            category: 'server',
        }),
        key: 'PORT',
    },
});

// 2. Create registry
const env = createEnvRegistry(schema);

// 3. Load and validate
loadEnvironment();
const validation = env.validate();

if (!validation.valid) {
    console.error('Environment errors:', validation.errors);
    process.exit(1);
}

// 4. Type-safe access
const dbUrl = env.require('DATABASE_URL');  // string
const port = env.get('PORT');               // number | undefined
```

## File Priority

Environment variables are loaded from multiple `.env` files with the following priority (higher priority overwrites lower):

```
1. .env                        # Base config (lowest priority)
2. .env.{NODE_ENV}             # Environment-specific (dev, prod, test)
3. .env.local                  # Local overrides (gitignored)
4. .env.{NODE_ENV}.local       # Environment + local (highest priority)
```

### Example

```bash
# .env (committed to git)
DATABASE_URL=postgresql://localhost:5432/mydb
API_URL=https://api.example.com

# .env.local (gitignored, developer-specific)
DATABASE_URL=postgresql://localhost:5432/mydb_local
DEBUG=true

# .env.production (production config)
API_URL=https://api.production.com
DATABASE_URL=postgresql://prod-server:5432/prod_db
```

### Test Environment Behavior

In test environments (`NODE_ENV=test`):
- `.env.local` files are skipped for test isolation
- Only `.env` and `.env.test` files are loaded

## Namespace Support

Organize environment variables by package, feature, or service using namespaces.

### Flat Structure (Default)

```bash
# File structure
.env                    # Global config
.env.auth               # Auth module config
.env.auth.development   # Auth dev config
.env.payment            # Payment module config
```

```typescript
// Load auth module config
loadEnvironment({ namespace: 'auth' });

// Load payment module config
loadEnvironment({ namespace: 'payment' });
```

### Folder Structure

```bash
# File structure
.env/
  global/
    .env
    .env.development
  auth/
    .env
    .env.development
  payment/
    .env
```

```typescript
loadEnvironment({
    namespace: 'auth',
    useFolderStructure: true
});
```

### Use Cases

**Monorepo Packages:**
```typescript
// packages/core
loadEnvironment({ namespace: 'spfn-core' });

// packages/cms
loadEnvironment({ namespace: 'spfn-cms' });
```

**Feature Modules:**
```typescript
loadEnvironment({ namespace: 'auth' });
loadEnvironment({ namespace: 'payment' });
loadEnvironment({ namespace: 'email' });
```

**Microservices:**
```typescript
loadEnvironment({ namespace: 'api' });
loadEnvironment({ namespace: 'worker' });
loadEnvironment({ namespace: 'admin' });
```

## Type-Safe Validation

### Parser Functions (Recommended)

Parser functions validate and transform values:

```typescript
import {
    parseNumber,
    parseUrl,
    parseEnum,
    parsePostgresUrl,
    parseRedisUrl,
    createNumberParser,
    createUrlParser,
    createEnumParser
} from '@spfn/core/env';

// Number parsing
const port = getEnvVar<number>('PORT', {
    default: 3000,
    validator: createNumberParser({
        min: 1,
        max: 65535,
        integer: true
    })
});

// URL validation
const apiUrl = getEnvVar<string>('API_URL', {
    required: true,
    validator: createUrlParser('https')
});

// Enum validation
const logLevel = getEnvVar<string>('LOG_LEVEL', {
    default: 'info',
    validator: createEnumParser(['debug', 'info', 'warn', 'error'])
});

// Database URLs
const dbUrl = getEnvVar<string>('DATABASE_URL', {
    required: true,
    validator: parsePostgresUrl
});

const redisUrl = getEnvVar<string>('REDIS_URL', {
    validator: parseRedisUrl
});
```

### Inline Parsers

```typescript
// Use parser functions inline for one-off validations
const timeout = getEnvVar<number>('TIMEOUT', {
    default: 3000,
    validator: (val) => parseNumber(val, { min: 1000, max: 30000 })
});
```

### Available Parsers

| Parser | Description | Options |
|--------|-------------|---------|
| `parseNumber` | Parse and validate numbers | `min`, `max`, `integer` |
| `parseUrl` | Validate URLs | `protocol: 'http' \| 'https' \| 'any'` |
| `parseEnum` | Validate enum values | `allowed: string[]`, `caseInsensitive` |
| `parsePostgresUrl` | Validate PostgreSQL URLs | - |
| `parseRedisUrl` | Validate Redis URLs | - |

## Schema-Based API

For larger applications with many environment variables, use the schema-based API for centralized management, automatic validation, and documentation generation.

### Define Schema

Use schema helpers to define your environment variables with metadata:

```typescript
import {
    defineEnvSchema,
    envString,
    envNumber,
    envBoolean,
    envUrl,
    envEnum,
    parsePostgresUrl,
    createNumberParser,
} from '@spfn/core/env';

const schema = defineEnvSchema({
    // Database
    DATABASE_URL: {
        ...envUrl({
            description: 'PostgreSQL database connection',
            required: true,
            validator: parsePostgresUrl,
            category: 'database',
            sensitive: true,
            examples: ['postgresql://user:pass@localhost:5432/mydb'],
        }),
        key: 'DATABASE_URL',
    },

    // Server
    PORT: {
        ...envNumber({
            description: 'Server port number',
            default: 3000,
            validator: createNumberParser({ min: 1, max: 65535, integer: true }),
            category: 'server',
        }),
        key: 'PORT',
    },

    HOST: {
        ...envString({
            description: 'Server host',
            default: '0.0.0.0',
            category: 'server',
        }),
        key: 'HOST',
    },

    // Features
    DEBUG: {
        ...envBoolean({
            description: 'Enable debug mode',
            default: false,
            category: 'features',
        }),
        key: 'DEBUG',
    },

    LOG_LEVEL: {
        ...envEnum(['debug', 'info', 'warn', 'error'] as const, {
            description: 'Logging level',
            default: 'info',
            category: 'features',
        }),
        key: 'LOG_LEVEL',
    },

    // API
    API_KEY: {
        ...envString({
            description: 'External API key',
            required: true,
            sensitive: true,
            category: 'api',
        }),
        key: 'API_KEY',
    },

    // Client-accessible (NEXT_PUBLIC_*)
    NEXT_PUBLIC_API_URL: {
        ...envUrl({
            description: 'Public API endpoint',
            required: true,
            category: 'client',
        }),
        key: 'NEXT_PUBLIC_API_URL',
    },
});
```

### Schema Helpers

| Helper | Type | Description |
|--------|------|-------------|
| `envString(options)` | `string` | String variable |
| `envNumber(options)` | `number` | Number variable |
| `envBoolean(options)` | `boolean` | Boolean variable |
| `envUrl(options)` | `string` | URL variable |
| `envEnum(allowed, options)` | `T` | Enum variable |
| `envJson(options)` | `T` | JSON variable |

**Options:**
- `description` (required) - Purpose and usage
- `required` - Is this variable required?
- `default` - Default value if not set
- `validator` - Parser/validation function
- `category` - Logical grouping
- `sensitive` - Contains secrets?
- `examples` - Example values for documentation

### Create Registry

Create a type-safe registry from your schema:

```typescript
import { createEnvRegistry } from '@spfn/core/env';

const env = createEnvRegistry(schema);

// Type-safe access
const dbUrl = env.require('DATABASE_URL');  // string (throws if missing)
const port = env.get('PORT');               // number | undefined
const host = env.get('HOST');               // string (uses default)
```

### Validate Environment

Validate all variables at startup:

```typescript
const validation = env.validate();

if (!validation.valid) {
    // Critical errors (missing required variables)
    validation.errors.forEach((error) => {
        console.error(`❌ ${error.key}: ${error.message}`);
    });

    process.exit(1);
}

// Non-critical warnings
if (validation.warnings.length > 0) {
    validation.warnings.forEach((warning) => {
        console.warn(`⚠️  ${warning.key}: ${warning.message}`);
        if (warning.suggestion) {
            console.warn(`   💡 ${warning.suggestion}`);
        }
    });
}
```

**Validation checks:**
- ✅ Required variables are present
- ⚠️ Sensitive data in client-accessible variables (`NEXT_PUBLIC_*`)
- ⚠️ Undefined variables (no schema)

### Query Registry

The registry provides helpful methods to query your schema:

```typescript
// Get all schemas
const allSchemas = env.getAllSchemas();

// Get schemas by category
const dbSchemas = env.getByCategory('database');
const apiSchemas = env.getByCategory('api');

// Get required variables
const required = env.getRequired();

// Get sensitive variables
const sensitive = env.getSensitive();

// Get server-only variables
const serverOnly = env.getServerOnly();

// Get client-accessible variables (NEXT_PUBLIC_*)
const clientVars = env.getClientAccessible();
```

## Auto Documentation

Generate documentation automatically from your schema.

### Generate Markdown Documentation

Create comprehensive documentation for your environment variables:

```typescript
import { generateMarkdownDocs } from '@spfn/core/env';
import { writeFileSync } from 'fs';

const markdown = generateMarkdownDocs(env);
writeFileSync('docs/ENVIRONMENT.md', markdown);
```

**Generated documentation includes:**
- Summary statistics (total, required, sensitive, etc.)
- Variables grouped by category
- Runtime environment (client vs server)
- Descriptions and examples
- Required/optional status
- Sensitive data warnings

### Generate .env.example

Create an `.env.example` file for your team:

```typescript
import { generateEnvExample } from '@spfn/core/env';
import { writeFileSync } from 'fs';

const example = generateEnvExample(env);
writeFileSync('.env.example', example);
```

**Generated file includes:**
- Variables grouped by category
- Descriptions as comments
- Example values
- Type information
- Required/optional indicators
- Sensitive data warnings
- Default values

Example output:
```bash
#
# database
#

# PostgreSQL database connection
# Example: postgresql://user:pass@localhost:5432/mydb
# Type: url (required)
# 🔒 Sensitive information
DATABASE_URL=

#
# server
#

# Server port number
# Type: number
PORT=3000

# Server host
# Type: string
# HOST=0.0.0.0
```

### Generate JSON Documentation

For programmatic access or API documentation:

```typescript
import { generateJsonDocs } from '@spfn/core/env';
import { writeFileSync } from 'fs';

const json = generateJsonDocs(env);
writeFileSync('docs/environment.json', json);
```

**JSON structure:**
```json
{
  "metadata": {
    "generatedAt": "2025-01-17T...",
    "totalCount": 7,
    "requiredCount": 3,
    "sensitiveCount": 2,
    "serverOnlyCount": 6,
    "clientAccessibleCount": 1
  },
  "variables": [
    {
      "key": "DATABASE_URL",
      "description": "PostgreSQL database connection",
      "type": "url",
      "required": true,
      "category": "database",
      "sensitive": true,
      "isClientAccessible": false,
      "examples": ["postgresql://user:pass@localhost:5432/mydb"]
    }
  ]
}
```

## Helper Functions

### `getEnvVar<T>()`

Get an environment variable with optional validation:

```typescript
// Optional variable
const debug = getEnvVar('DEBUG');

// With default
const port = getEnvVar('PORT', { default: '3000' });

// Required variable
const apiKey = getEnvVar('API_KEY', { required: true });

// With validation
const port = getEnvVar<number>('PORT', {
    default: 3000,
    validator: createNumberParser({ min: 1 })
});
```

### `requireEnvVar()`

Get a required variable (throws if missing):

```typescript
const apiKey = requireEnvVar('API_KEY');
// Equivalent to:
// getEnvVar('API_KEY', { required: true })
```

### `hasEnvVar()`

Check if a variable exists:

```typescript
if (hasEnvVar('DEBUG')) {
    console.log('Debug mode enabled');
}
```

### `getEnvVars()`

Get multiple variables at once:

```typescript
const { PORT, API_URL, DATABASE_URL } = getEnvVars([
    'PORT',
    'API_URL',
    'DATABASE_URL'
]);
```

## Advanced Features

### Required Variables

Enforce required variables on load:

```typescript
loadEnvironment({
    required: ['DATABASE_URL', 'API_KEY', 'SECRET']
});
// Throws if any required variable is missing
```

### Custom Paths

Load from custom file paths:

```typescript
loadEnvironment({
    customPaths: [
        '/path/to/custom.env',
        '/etc/app/config.env'
    ]
});
```

### Debug Mode

Enable debug logging:

```typescript
loadEnvironment({ debug: true });
// Logs: file paths, loaded variables, warnings
```

### Force Reload

Bypass singleton cache:

```typescript
loadEnvironment({ useCache: false });
```

## Best Practices

### 1. Load Once at Startup

```typescript
// src/server/index.ts
import { loadEnvironment } from '@spfn/core/env';

// Load environment variables once
loadEnvironment({
    required: ['DATABASE_URL', 'API_KEY']
});

// Now use getEnvVar() anywhere
```

### 2. Use Type-Safe Parsers

```typescript
// ❌ Bad - no type safety
const port = Number(process.env.PORT || '3000');

// ✅ Good - type-safe with validation
const port = getEnvVar<number>('PORT', {
    default: 3000,
    validator: createNumberParser({ min: 1, max: 65535 })
});
```

### 3. Organize with Namespaces

```typescript
// Feature modules
loadEnvironment({ namespace: 'auth' });
loadEnvironment({ namespace: 'payment' });

// Each module gets its own config
// .env.auth, .env.payment, etc.
```

### 4. Never Commit Secrets

```bash
# .gitignore
.env.local
.env.*.local
.env.production
```

### 5. Validate Early

```typescript
// Validate all required variables on startup
loadEnvironment({
    required: [
        'DATABASE_URL',
        'API_KEY',
        'SECRET',
        'REDIS_URL'
    ]
});

// App won't start if any are missing
```

### 6. Use Meaningful Defaults

```typescript
const port = getEnvVar<number>('PORT', {
    default: 3000,  // Clear default
    validator: createNumberParser({ min: 1, max: 65535 })
});

const logLevel = getEnvVar<string>('LOG_LEVEL', {
    default: 'info',  // Safe default
    validator: createEnumParser(['debug', 'info', 'warn', 'error'])
});
```

## Migration from Boolean Validators

The old boolean-returning validators are deprecated. Use parser functions instead:

```typescript
// ❌ Deprecated
const port = getEnvVar('PORT', {
    validator: (val) => validateNumber(val, { min: 1 })
});

// ✅ Recommended
const port = getEnvVar<number>('PORT', {
    validator: createNumberParser({ min: 1 })
});
```

## API Reference

### `loadEnvironment(options?)`

Load environment variables from `.env` files.

**Options:**
```typescript
{
    basePath?: string;           // Base directory (default: process.cwd())
    namespace?: string;          // Namespace for modular config
    useFolderStructure?: boolean; // Use folder-based structure
    customPaths?: string[];      // Additional files to load
    debug?: boolean;             // Enable debug logging
    nodeEnv?: string;            // Override NODE_ENV
    required?: string[];         // Required variables
    useCache?: boolean;          // Use singleton cache (default: true)
}
```

**Returns:** `LoadResult`
```typescript
{
    success: boolean;
    loaded: string[];      // Successfully loaded files
    failed: string[];      // Failed to load files
    parsed: Record<string, string>; // Parsed variables
    warnings: string[];    // Warnings (e.g., NODE_ENV in .env)
}
```

### `getEnvVar<T>(key, options?)`

Get an environment variable with type safety.

**Options:**
```typescript
{
    default?: T;                    // Default value
    required?: boolean;             // Throw if missing
    validator?: (value: string) => T; // Parse and validate
    validationError?: string;       // Custom error message (deprecated)
}
```

### Parser Functions

All parser functions follow this pattern:

```typescript
// Direct usage
parseNumber(value: string, options?: {...}): number

// Factory functions
createNumberParser(options?: {...}): (value: string) => number
```

**Available:**
- `parseNumber` / `createNumberParser`
- `parseUrl` / `createUrlParser`
- `parseEnum` / `createEnumParser`
- `parsePostgresUrl`
- `parseRedisUrl`

## Examples

### Full Application Setup

```typescript
// src/server/index.ts
import { loadEnvironment, getEnvVar } from '@spfn/core/env';
import {
    createNumberParser,
    createUrlParser,
    createEnumParser,
    parsePostgresUrl
} from '@spfn/core/env';

// Load environment with validation
loadEnvironment({
    namespace: 'api',
    required: ['DATABASE_URL', 'API_KEY']
});

// Configure app
const config = {
    port: getEnvVar<number>('PORT', {
        default: 3000,
        validator: createNumberParser({ min: 1, max: 65535 })
    }),

    database: getEnvVar<string>('DATABASE_URL', {
        required: true,
        validator: parsePostgresUrl
    }),

    apiUrl: getEnvVar<string>('API_URL', {
        required: true,
        validator: createUrlParser('https')
    }),

    logLevel: getEnvVar<string>('LOG_LEVEL', {
        default: 'info',
        validator: createEnumParser(['debug', 'info', 'warn', 'error'])
    }),

    apiKey: requireEnvVar('API_KEY')
};

console.log('Config loaded:', config);
```

### Namespace Configuration

```typescript
// packages/auth/src/index.ts
loadEnvironment({ namespace: 'auth' });

const authConfig = {
    jwtSecret: requireEnvVar('JWT_SECRET'),
    jwtExpiry: getEnvVar('JWT_EXPIRY', { default: '7d' }),
    oauth: {
        clientId: requireEnvVar('OAUTH_CLIENT_ID'),
        clientSecret: requireEnvVar('OAUTH_CLIENT_SECRET')
    }
};

// packages/payment/src/index.ts
loadEnvironment({ namespace: 'payment' });

const paymentConfig = {
    stripeKey: requireEnvVar('STRIPE_KEY'),
    webhookSecret: requireEnvVar('STRIPE_WEBHOOK_SECRET')
};
```

## Troubleshooting

### Variables Not Loading

1. Check file path: `.env` should be in `process.cwd()`
2. Verify file names: `.env.development` not `.env.dev`
3. Enable debug mode: `loadEnvironment({ debug: true })`

### Validation Errors

```typescript
// Error: "Must be a valid number, got: abc"
const port = getEnvVar<number>('PORT', {
    validator: createNumberParser()
});

// Fix: Ensure PORT contains a valid number
// .env: PORT=3000
```

### Namespace Not Working

```typescript
// Ensure namespace files exist
// .env.auth or .env/auth/.env

loadEnvironment({
    namespace: 'auth',
    debug: true  // See which files are loaded
});
```

## Related

- [Database Guide](./database.md) - Database configuration
- [Error Handling](./error-handling.md) - Error handling patterns
- [Deployment](./deployment.md) - Production deployment