# @spfn/core/env - Environment Variable Management

Centralized environment variable loading with Next.js-style priority and comprehensive validation utilities.

## Features

- ✅ **Next.js-Style Loading**: Priority-based .env file loading
- ✅ **Test Isolation**: Automatic .env.local exclusion in test environment
- ✅ **Singleton Pattern**: Load once, cache results
- ✅ **Required Variables**: Validate required env vars on load
- ✅ **Custom Paths**: Support for custom .env file locations
- ✅ **Validation Utilities**: URL, number, boolean, enum, pattern validators
- ✅ **Type-Safe**: Full TypeScript support

---

## Quick Start

### Basic Usage

```typescript
import { loadEnvironment, getEnvVar } from '@spfn/core/env';

// Load environment variables
loadEnvironment({
  debug: true,
  required: ['DATABASE_URL', 'API_KEY'],
});

// Get variables
const dbUrl = getEnvVar('DATABASE_URL', { required: true });
const port = getEnvVar('PORT', { default: '3000' });
```

### With Validation

```typescript
import { getEnvVar, validateUrl, createNumberValidator } from '@spfn/core/env';

// Validate URL
const apiUrl = getEnvVar('API_URL', {
  validator: validateUrl,
  validationError: 'API_URL must be a valid URL',
});

// Validate number with constraints
const port = getEnvVar('PORT', {
  validator: createNumberValidator({ min: 1, max: 65535, integer: true }),
  validationError: 'PORT must be between 1 and 65535',
});
```

---

## Environment File Priority

Next.js-style loading behavior with highest priority last:

### Development Environment
```
.env                      # Base (lowest priority)
.env.development          # Environment-specific
.env.local                # Local overrides
.env.development.local    # Local environment-specific (highest priority)
```

### Production Environment
```
.env
.env.production
.env.local
.env.production.local
```

### Test Environment
```
.env
.env.test
(skip .env.local)         # Excluded for test isolation
.env.test.local
```

### No NODE_ENV Set
```
.env
.env.local
```

---

## Loading Environment Variables

### `loadEnvironment(options?)`

Load environment variables from .env files with priority support.

**Options:**

```typescript
interface LoadEnvironmentOptions {
  basePath?: string;           // Base directory (default: process.cwd())
  customPaths?: string[];      // Additional custom paths
  debug?: boolean;             // Enable debug logging (default: false)
  nodeEnv?: string;            // Override NODE_ENV (default: process.env.NODE_ENV)
  required?: string[];         // Required variables to validate
  useCache?: boolean;          // Use cached result (default: true)
}
```

**Examples:**

```typescript
// Simple usage
loadEnvironment();

// With required variables
loadEnvironment({
  required: ['DATABASE_URL', 'API_KEY'],
});

// With debug logging
loadEnvironment({
  debug: true,
  nodeEnv: 'staging',
});

// With custom paths
loadEnvironment({
  customPaths: ['/path/to/custom.env'],
});

// Force reload (bypass cache)
loadEnvironment({
  useCache: false,
});
```

**Returns:**

```typescript
interface LoadResult {
  success: boolean;                             // Overall success
  loaded: string[];                             // Successfully loaded files
  failed: Array<{ path: string; reason: string }>; // Failed files
  parsed: Record<string, string>;               // Parsed variables
  errors?: string[];                            // Critical errors
  warnings: string[];                           // Non-critical warnings
}
```

---

## Getting Environment Variables

### `getEnvVar(key, options?)`

Get an environment variable with optional validation.

**Options:**

```typescript
interface GetEnvOptions {
  required?: boolean;                    // Throw if not found (default: false)
  default?: string;                      // Default value if not found
  validator?: (value: string) => boolean; // Custom validation
  validationError?: string;              // Custom error message
}
```

**Examples:**

```typescript
// Simple get
const apiUrl = getEnvVar('API_URL');

// With default
const port = getEnvVar('PORT', { default: '3000' });

// Required variable
const dbUrl = getEnvVar('DATABASE_URL', { required: true });

// With validation
const httpsUrl = getEnvVar('API_URL', {
  validator: (val) => val.startsWith('https://'),
  validationError: 'API_URL must use HTTPS',
});
```

### `requireEnvVar(key)`

Get a required environment variable (throws if not found).

```typescript
const dbUrl = requireEnvVar('DATABASE_URL');
```

### `hasEnvVar(key)`

Check if an environment variable exists.

```typescript
if (hasEnvVar('REDIS_URL')) {
  // Use Redis
}
```

### `getEnvVars(keys)`

Get multiple environment variables at once.

```typescript
const { DATABASE_URL, REDIS_URL, API_KEY } = getEnvVars([
  'DATABASE_URL',
  'REDIS_URL',
  'API_KEY',
]);
```

### `isEnvironmentLoaded()`

Check if environment has been loaded.

```typescript
if (!isEnvironmentLoaded()) {
  loadEnvironment();
}
```

---

## Validation Utilities

### URL Validation

**`validateUrl(value, options?)`**

Validate that a value is a valid URL.

```typescript
const apiUrl = getEnvVar('API_URL', {
  validator: validateUrl,
});

// With protocol requirement
const httpsUrl = getEnvVar('API_URL', {
  validator: (val) => validateUrl(val, { protocol: 'https' }),
});
```

**`createUrlValidator(protocol)`**

Create a URL validator with specific protocol requirement.

```typescript
const apiUrl = getEnvVar('API_URL', {
  validator: createUrlValidator('https'),
  validationError: 'API_URL must use HTTPS',
});
```

### Number Validation

**`validateNumber(value, options?)`**

Validate that a value is a valid number.

```typescript
const port = getEnvVar('PORT', {
  validator: (val) => validateNumber(val, { min: 1, max: 65535, integer: true }),
});
```

**`createNumberValidator(options)`**

Create a number validator with specific constraints.

```typescript
const port = getEnvVar('PORT', {
  validator: createNumberValidator({ min: 1, max: 65535, integer: true }),
  validationError: 'PORT must be between 1 and 65535',
});
```

### Boolean Validation

**`validateBoolean(value)`**

Validate that a value is a valid boolean string.

```typescript
const debug = getEnvVar('DEBUG', {
  validator: validateBoolean,
});
```

**`parseBoolean(value)`**

Parse a boolean environment variable.

```typescript
const debug = parseBoolean(getEnvVar('DEBUG', { default: 'false' })!);
// Accepts: 'true', '1', 'yes' → true
//          'false', '0', 'no' → false
```

### Enum Validation

**`validateEnum(value, allowed, caseInsensitive?)`**

Validate that a value is one of allowed options.

```typescript
const env = getEnvVar('NODE_ENV', {
  validator: (val) => validateEnum(val, ['development', 'production', 'test']),
});
```

**`createEnumValidator(allowed, caseInsensitive?)`**

Create an enum validator with specific allowed values.

```typescript
const logLevel = getEnvVar('LOG_LEVEL', {
  validator: createEnumValidator(['debug', 'info', 'warn', 'error']),
  validationError: 'LOG_LEVEL must be one of: debug, info, warn, error',
});
```

### Pattern Validation

**`validatePattern(value, pattern)`**

Validate that a value matches a regular expression.

```typescript
const apiKey = getEnvVar('API_KEY', {
  validator: (val) => validatePattern(val, /^[A-Za-z0-9_-]{32}$/),
});
```

**`createPatternValidator(pattern)`**

Create a pattern validator with specific regex.

```typescript
const apiKey = getEnvVar('API_KEY', {
  validator: createPatternValidator(/^[A-Za-z0-9_-]{32}$/),
  validationError: 'API_KEY must be 32 alphanumeric characters',
});
```

### String Validation

**`validateNotEmpty(value)`**

Validate that a value is not empty.

```typescript
const name = getEnvVar('APP_NAME', {
  validator: validateNotEmpty,
});
```

**`validateMinLength(value, minLength)`**

Validate that a value has minimum length.

```typescript
const password = getEnvVar('DB_PASSWORD', {
  validator: (val) => validateMinLength(val, 8),
});
```

**`createMinLengthValidator(minLength)`**

Create a minimum length validator.

```typescript
const password = getEnvVar('DB_PASSWORD', {
  validator: createMinLengthValidator(8),
  validationError: 'DB_PASSWORD must be at least 8 characters',
});
```

### Combined Validators

**`combineValidators(validators)`**

Combine multiple validators with AND logic.

```typescript
const port = getEnvVar('PORT', {
  validator: combineValidators([
    validateNotEmpty,
    createNumberValidator({ min: 1, max: 65535, integer: true }),
  ]),
});
```

### Database URL Validation

**`validatePostgresUrl(value)`**

Validate PostgreSQL connection string.

```typescript
const dbUrl = getEnvVar('DATABASE_URL', {
  validator: validatePostgresUrl,
  validationError: 'DATABASE_URL must be a valid PostgreSQL URL',
});
```

**`validateRedisUrl(value)`**

Validate Redis connection string.

```typescript
const redisUrl = getEnvVar('REDIS_URL', {
  validator: validateRedisUrl,
  validationError: 'REDIS_URL must be a valid Redis URL',
});
```

---

## Complete Example

```typescript
import {
  loadEnvironment,
  getEnvVar,
  requireEnvVar,
  createNumberValidator,
  createUrlValidator,
  validatePostgresUrl,
  parseBoolean,
} from '@spfn/core/env';

// Load environment with required variables
const result = loadEnvironment({
  debug: process.env.NODE_ENV !== 'production',
  required: ['DATABASE_URL', 'API_KEY'],
});

console.log(`Loaded ${result.loaded.length} environment files`);

// Get validated variables
const config = {
  // Database
  databaseUrl: requireEnvVar('DATABASE_URL'),

  // Server
  port: parseInt(
    getEnvVar('PORT', {
      default: '3000',
      validator: createNumberValidator({ min: 1, max: 65535, integer: true }),
    })!
  ),
  host: getEnvVar('HOST', { default: '0.0.0.0' }),

  // API
  apiUrl: getEnvVar('API_URL', {
    required: true,
    validator: createUrlValidator('https'),
    validationError: 'API_URL must use HTTPS',
  }),
  apiKey: requireEnvVar('API_KEY'),

  // Features
  debug: parseBoolean(getEnvVar('DEBUG', { default: 'false' })!),
  enableRedis: parseBoolean(getEnvVar('ENABLE_REDIS', { default: 'false' })!),
};

// Conditional configuration
if (config.enableRedis) {
  const redisUrl = getEnvVar('REDIS_URL', {
    required: true,
    validator: validatePostgresUrl,
  });
  // Initialize Redis...
}

export default config;
```

---

## Best Practices

### 1. Load Environment Early

```typescript
// ✅ Load at application startup
import { loadEnvironment } from '@spfn/core/env';

loadEnvironment({
  required: ['DATABASE_URL', 'API_KEY'],
});

// Then import other modules
import { app } from './app';
```

### 2. Use Required Variables

```typescript
// ❌ Missing variables discovered at runtime
const dbUrl = process.env.DATABASE_URL!;

// ✅ Fail fast on startup
loadEnvironment({
  required: ['DATABASE_URL', 'API_KEY'],
});
```

### 3. Validate Input

```typescript
// ❌ No validation
const port = parseInt(process.env.PORT || '3000');

// ✅ Validated and constrained
const port = parseInt(
  getEnvVar('PORT', {
    default: '3000',
    validator: createNumberValidator({ min: 1, max: 65535, integer: true }),
  })!
);
```

### 4. Don't Commit .env.local

```bash
# .gitignore
.env.local
.env.*.local
```

### 5. Use .env for Defaults

```bash
# .env (committed)
PORT=3000
HOST=0.0.0.0
DEBUG=false

# .env.local (not committed)
DATABASE_URL=postgresql://localhost/mydb
API_KEY=my-secret-key
```

### 6. Set NODE_ENV via CLI

```json
{
  "scripts": {
    "dev": "NODE_ENV=development tsx src/index.ts",
    "build": "NODE_ENV=production tsc",
    "test": "NODE_ENV=test vitest"
  }
}
```

---

## Test Coverage

The env module has comprehensive test coverage with **68 tests** (all passing ✅).

### Environment Loader Tests (38 tests)
**File:** `src/env/__tests__/loader.test.ts`

- **File Priority** (5 tests)
  - .env as base
  - .env.{NODE_ENV} override
  - .env.local override
  - .env.{NODE_ENV}.local highest priority
  - Multiple files merging

- **Singleton Pattern** (3 tests)
  - Load only once
  - Return cached result
  - Force reload with useCache: false

- **Required Variables** (3 tests)
  - Validate required variables
  - Throw on missing required
  - Clear error messages with context

- **Custom Paths** (2 tests)
  - Load from custom paths
  - Custom paths respect priority (highest)

- **Error Handling** (2 tests)
  - Handle invalid file syntax
  - Continue loading other files if one fails

- **Test Environment Files** (2 tests)
  - Do not load .env.test in non-test environment
  - Load .env.test in test environment

- **NODE_ENV Handling** (4 tests)
  - Load .env and .env.local when NODE_ENV not set
  - Warn when NODE_ENV set in .env files
  - Warn when NODE_ENV set in .env.local
  - Skip .env.local when NODE_ENV=local (avoid duplicates)

- **Load Result** (2 tests)
  - Return detailed load result
  - Track failed file loads with reasons

- **Debug Logging** (1 test)
  - Log debug information when enabled

- **Helper Functions** (14 tests)
  - `getEnvVar()`: simple get, with default, required, with validation
  - `requireEnvVar()`: throw on missing
  - `hasEnvVar()`: check existence
  - `getEnvVars()`: get multiple variables
  - `isEnvironmentLoaded()`: check state

### Validation Utilities Tests (30 tests)
**File:** `src/env/__tests__/validator.test.ts`

- **URL Validation** (6 tests)
  - Valid URLs
  - Invalid URLs
  - Protocol-specific validation (http, https, any)
  - `createUrlValidator()` factory function

- **Number Validation** (7 tests)
  - Valid numbers
  - Invalid numbers (NaN, empty string)
  - Min/max constraints
  - Integer requirement
  - `createNumberValidator()` factory function

- **Boolean Validation** (4 tests)
  - Valid boolean strings ('true', 'false', '1', '0', 'yes', 'no')
  - Invalid boolean strings
  - `parseBoolean()` parsing ('true', '1', 'yes' → true)

- **Enum Validation** (3 tests)
  - Allowed values
  - Case-insensitive matching
  - `createEnumValidator()` factory function

- **Pattern Validation** (3 tests)
  - Valid regex patterns
  - Invalid regex patterns
  - `createPatternValidator()` factory function

- **String Validation** (3 tests)
  - `validateNotEmpty()` checks
  - `validateMinLength()` checks
  - `createMinLengthValidator()` factory function

- **Combined Validators** (1 test)
  - `combineValidators()` with AND logic

- **Database URL Validation** (3 tests)
  - `validatePostgresUrl()` (postgres:// and postgresql://)
  - `validateRedisUrl()` (redis:// and rediss://)
  - Invalid database URLs

### Running Tests

```bash
# Run all env tests
pnpm test src/env

# Run specific test file
pnpm test src/env/__tests__/loader.test.ts
pnpm test src/env/__tests__/validator.test.ts

# Watch mode
pnpm test:watch src/env
```

---

## Troubleshooting

### Variables Not Loading

**Cause:** Environment not loaded before accessing variables

**Solution:**
```typescript
// ✅ Load first
loadEnvironment();

// Then access variables
const dbUrl = getEnvVar('DATABASE_URL');
```

### .env.local Not Working in Tests

**Cause:** By design - .env.local is excluded in test environment for isolation

**Solution:**
```bash
# Use .env.test.local instead
# .env.test.local (not committed)
DATABASE_URL=postgresql://localhost/test_db
```

### NODE_ENV Warnings

**Cause:** NODE_ENV found in .env files

**Solution:**
```bash
# ❌ Don't set NODE_ENV in .env files
# .env
NODE_ENV=development  # This will warn

# ✅ Set via CLI instead
# package.json
{
  "scripts": {
    "dev": "NODE_ENV=development tsx src/index.ts"
  }
}
```

---

## Related

- [dotenv](https://github.com/motdotla/dotenv) - Underlying .env parser
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables) - Inspiration for priority system
- [@spfn/core](../../README.md) - Main package documentation