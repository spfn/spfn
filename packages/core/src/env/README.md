# @spfn/core/env - Environment Variable Management

Centralized environment variable loading with Next.js-style priority, namespace support, and comprehensive type-safe validation utilities.

## Features

- ✅ **Next.js-Style Loading**: Priority-based .env file loading
- ✅ **Namespace Support**: Modular configuration for packages, features, or services
- ✅ **Type-Safe Parsers**: Parse and validate with strong typing
- ✅ **Test Isolation**: Automatic .env.local exclusion in test environment
- ✅ **Singleton Pattern**: Load once, cache results
- ✅ **Required Variables**: Validate required env vars on load
- ✅ **Custom Paths**: Support for custom .env file locations
- ✅ **Folder Structure**: Optional folder-based organization
- ✅ **Full TypeScript Support**: Complete type safety
- ✅ **Schema-Based Management** (NEW): Centralized schema definition with metadata
- ✅ **Auto Documentation** (NEW): Generate docs and .env.example automatically
- ✅ **Validation System** (NEW): Comprehensive validation with warnings

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

### Schema-Based Usage (NEW)

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

### With Type-Safe Parsers (Recommended)

```typescript
import {
  getEnvVar,
  createNumberParser,
  createUrlParser,
  parsePostgresUrl
} from '@spfn/core/env';

// Parse number with validation
const port = getEnvVar<number>('PORT', {
  default: 3000,
  validator: createNumberParser({ min: 1, max: 65535, integer: true })
});

// Validate URL with protocol requirement
const apiUrl = getEnvVar<string>('API_URL', {
  required: true,
  validator: createUrlParser('https')
});

// Validate database URL
const dbUrl = getEnvVar<string>('DATABASE_URL', {
  required: true,
  validator: parsePostgresUrl
});
```

### With Namespace Support

```typescript
// Load feature-specific config
loadEnvironment({ namespace: 'auth' });

// Or package-specific config
loadEnvironment({ namespace: 'spfn-core' });
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

## Namespace Support

Organize environment variables by package, feature, or service.

### Flat Structure (Default)

```bash
# File structure
.env                    # Global config
.env.auth               # Auth module config
.env.auth.development   # Auth dev environment
.env.payment            # Payment module config
```

```typescript
// Load auth module
loadEnvironment({ namespace: 'auth' });

// Files loaded:
// 1. .env
// 2. .env.development
// 3. .env.auth
// 4. .env.auth.development
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

// Files loaded:
// 1. .env/global/.env
// 2. .env/global/.env.development
// 3. .env/auth/.env
// 4. .env/auth/.env.development
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

---

## Loading Environment Variables

### `loadEnvironment(options?)`

Load environment variables from .env files with priority support.

**Options:**

```typescript
interface LoadEnvironmentOptions {
  basePath?: string;           // Base directory (default: process.cwd())
  namespace?: string;          // Namespace for modular config
  useFolderStructure?: boolean; // Use folder-based structure (default: false)
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

// With namespace
loadEnvironment({ namespace: 'auth' });

// With folder structure
loadEnvironment({
  namespace: 'auth',
  useFolderStructure: true
});

// With required variables
loadEnvironment({
  namespace: 'api',
  required: ['DATABASE_URL', 'API_KEY']
});

// With debug logging
loadEnvironment({
  debug: true,
  nodeEnv: 'staging'
});

// With custom paths
loadEnvironment({
  customPaths: ['/path/to/custom.env']
});

// Force reload (bypass cache)
loadEnvironment({
  useCache: false
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

### `getEnvVar<T>(key, options?)`

Get an environment variable with optional type-safe validation.

**Options:**

```typescript
interface GetEnvOptions<T> {
  required?: boolean;                // Throw if not found (default: false)
  default?: T;                       // Default value if not found
  validator?: (value: string) => T;  // Parser function (recommended)
  validationError?: string;          // Custom error message (deprecated)
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

// With type-safe parser
const port = getEnvVar<number>('PORT', {
  default: 3000,
  validator: createNumberParser({ min: 1, max: 65535 })
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

## Type-Safe Parser Functions

Parser functions validate and transform values with strong typing.

### Number Parsing

**`parseNumber(value, options?)`**

Parse and validate a number.

```typescript
const timeout = getEnvVar<number>('TIMEOUT', {
  default: 3000,
  validator: (val) => parseNumber(val, { min: 1000, max: 30000 })
});
```

**`createNumberParser(options)`**

Create a reusable number parser.

```typescript
const portParser = createNumberParser({
  min: 1,
  max: 65535,
  integer: true
});

const port = getEnvVar<number>('PORT', {
  default: 3000,
  validator: portParser
});
```

**Options:**
- `min?: number` - Minimum value
- `max?: number` - Maximum value
- `integer?: boolean` - Require integer (default: false)

### URL Validation

**`parseUrl(value, options?)`**

Parse and validate a URL.

```typescript
const apiUrl = getEnvVar<string>('API_URL', {
  required: true,
  validator: (val) => parseUrl(val, { protocol: 'https' })
});
```

**`createUrlParser(protocol)`**

Create a URL parser with protocol requirement.

```typescript
const httpsParser = createUrlParser('https');

const apiUrl = getEnvVar<string>('API_URL', {
  required: true,
  validator: httpsParser
});
```

**Options:**
- `protocol?: 'http' | 'https' | 'any'` - Required protocol (default: 'any')

### Enum Validation

**`parseEnum(value, allowed, caseInsensitive?)`**

Parse and validate an enum value.

```typescript
const env = getEnvVar<string>('NODE_ENV', {
  required: true,
  validator: (val) => parseEnum(val, ['development', 'production', 'test'])
});
```

**`createEnumParser(allowed, caseInsensitive?)`**

Create an enum parser.

```typescript
const logLevelParser = createEnumParser(['debug', 'info', 'warn', 'error']);

const logLevel = getEnvVar<string>('LOG_LEVEL', {
  default: 'info',
  validator: logLevelParser
});
```

### Database URLs

**`parsePostgresUrl(value)`**

Validate PostgreSQL connection string.

```typescript
const dbUrl = getEnvVar<string>('DATABASE_URL', {
  required: true,
  validator: parsePostgresUrl
});
```

**`parseRedisUrl(value)`**

Validate Redis connection string.

```typescript
const redisUrl = getEnvVar<string>('REDIS_URL', {
  validator: parseRedisUrl
});
```

---

## Deprecated Boolean Validators

The old boolean-returning validators are deprecated. Use parser functions instead for better type safety and error messages.

### URL Validation (Deprecated)

**`validateUrl(value, options?)` - @deprecated**

Use `parseUrl` or `createUrlParser` instead.

```typescript
// ❌ Deprecated
const apiUrl = getEnvVar('API_URL', {
  validator: validateUrl,
  validationError: 'API_URL must be a valid URL'
});

// ✅ Recommended
const apiUrl = getEnvVar<string>('API_URL', {
  required: true,
  validator: createUrlParser('https')
});
```

### Number Validation (Deprecated)

**`validateNumber(value, options?)` - @deprecated**

Use `parseNumber` or `createNumberParser` instead.

```typescript
// ❌ Deprecated
const port = getEnvVar('PORT', {
  validator: (val) => validateNumber(val, { min: 1, max: 65535 }),
  validationError: 'PORT must be between 1 and 65535'
});

// ✅ Recommended
const port = getEnvVar<number>('PORT', {
  default: 3000,
  validator: createNumberParser({ min: 1, max: 65535, integer: true })
});
```

### Other Validators

The following validators are still available but return boolean:

- `validateBoolean(value)` - Use with `validationError`
- `parseBoolean(value)` - Parse boolean (still valid)
- `validateEnum(value, allowed)` - Use `parseEnum` instead
- `validatePattern(value, pattern)` - Still valid for custom patterns
- `validateNotEmpty(value)` - Still valid
- `validateMinLength(value, min)` - Still valid
- `combineValidators(validators)` - Still valid

---

## Complete Example

```typescript
import {
  loadEnvironment,
  getEnvVar,
  requireEnvVar,
  createNumberParser,
  createUrlParser,
  createEnumParser,
  parsePostgresUrl,
  parseRedisUrl,
  parseBoolean,
} from '@spfn/core/env';

// Load environment with namespace and validation
const result = loadEnvironment({
  namespace: 'api',
  debug: process.env.NODE_ENV !== 'production',
  required: ['DATABASE_URL', 'API_KEY'],
});

console.log(`Loaded ${result.loaded.length} environment files`);

// Get validated variables with type safety
const config = {
  // Database
  databaseUrl: getEnvVar<string>('DATABASE_URL', {
    required: true,
    validator: parsePostgresUrl
  }),

  // Redis (optional)
  redisUrl: hasEnvVar('REDIS_URL')
    ? getEnvVar<string>('REDIS_URL', { validator: parseRedisUrl })
    : undefined,

  // Server
  port: getEnvVar<number>('PORT', {
    default: 3000,
    validator: createNumberParser({ min: 1, max: 65535, integer: true })
  }),
  host: getEnvVar('HOST', { default: '0.0.0.0' }),

  // API
  apiUrl: getEnvVar<string>('API_URL', {
    required: true,
    validator: createUrlParser('https')
  }),
  apiKey: requireEnvVar('API_KEY'),

  // Logging
  logLevel: getEnvVar<string>('LOG_LEVEL', {
    default: 'info',
    validator: createEnumParser(['debug', 'info', 'warn', 'error'])
  }),

  // Features
  debug: parseBoolean(getEnvVar('DEBUG', { default: 'false' })!),
  enableRedis: parseBoolean(getEnvVar('ENABLE_REDIS', { default: 'false' })!),
};

export default config;
```

---

## Best Practices

### 1. Load Environment Early

```typescript
// ✅ Load at application startup
import { loadEnvironment } from '@spfn/core/env';

loadEnvironment({
  namespace: 'api',
  required: ['DATABASE_URL', 'API_KEY']
});

// Then import other modules
import { app } from './app';
```

### 2. Use Namespaces for Modularity

```typescript
// ✅ Separate configs for different modules
loadEnvironment({ namespace: 'auth' });    // .env.auth
loadEnvironment({ namespace: 'payment' }); // .env.payment
loadEnvironment({ namespace: 'email' });   // .env.email
```

### 3. Use Type-Safe Parsers

```typescript
// ❌ No type safety, no validation
const port = Number(process.env.PORT || '3000');

// ✅ Type-safe with validation
const port = getEnvVar<number>('PORT', {
  default: 3000,
  validator: createNumberParser({ min: 1, max: 65535 })
});
```

### 4. Validate Required Variables

```typescript
// ❌ Missing variables discovered at runtime
const dbUrl = process.env.DATABASE_URL!;

// ✅ Fail fast on startup
loadEnvironment({
  required: ['DATABASE_URL', 'API_KEY']
});
```

### 5. Don't Commit Secrets

```bash
# .gitignore
.env.local
.env.*.local
.env.production
```

### 6. Use .env for Defaults

```bash
# .env (committed)
PORT=3000
HOST=0.0.0.0
DEBUG=false

# .env.local (not committed)
DATABASE_URL=postgresql://localhost/mydb
API_KEY=my-secret-key
```

### 7. Set NODE_ENV via CLI

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

The env module has comprehensive test coverage with **104 tests** (all passing ✅).

### Environment Loader Tests (55 tests)
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

- **Error Handling** (3 tests)
  - Handle missing files gracefully
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

- **Helper Functions** (12 tests)
  - `getEnvVar()`: simple get, with default, required, with validation
  - `requireEnvVar()`: throw on missing
  - `hasEnvVar()`: check existence
  - `getEnvVars()`: get multiple variables

- **Parser Usage Examples** (10 tests)
  - parseNumber, parseUrl, parseEnum usage
  - Inline vs factory function patterns
  - Error messages for invalid values

- **Namespace Support** (7 tests) ⭐ NEW
  - Flat structure loading
  - Folder structure loading
  - Variable override behavior
  - Multiple namespaces in sequence
  - Test environment compatibility
  - Backward compatibility

- **Load Result** (2 tests)
  - Return detailed load result
  - Track failed file loads with reasons

- **Debug Logging** (1 test)
  - Log debug information when enabled

### Validation Utilities Tests (49 tests)
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

- **Parser Functions** (19 tests) ⭐ NEW
  - `parseUrl()` with protocol validation
  - `parseNumber()` with constraints
  - `parseEnum()` with case sensitivity
  - `parsePostgresUrl()` validation
  - `parseRedisUrl()` validation
  - Factory function variants
  - Error message quality

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

### Namespace Files Not Found

**Cause:** Namespace files don't exist or wrong naming

**Solution:**
```bash
# Check file names
# Flat: .env.{namespace}
# Folder: .env/{namespace}/.env

# Enable debug to see which files are loaded
loadEnvironment({
  namespace: 'auth',
  debug: true
});
```

### Type Errors with Parsers

**Cause:** Missing generic type parameter

**Solution:**
```typescript
// ❌ Type error
const port = getEnvVar('PORT', {
  validator: createNumberParser()
});

// ✅ Specify generic type
const port = getEnvVar<number>('PORT', {
  default: 3000,
  validator: createNumberParser()
});
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

## API Summary

### Loading
- `loadEnvironment(options?)` - Load .env files
- `resetEnvironment()` - Reset singleton state
- `isEnvironmentLoaded()` - Check load state

### Getting Variables
- `getEnvVar<T>(key, options?)` - Get with validation
- `requireEnvVar(key)` - Get required variable
- `hasEnvVar(key)` - Check existence
- `getEnvVars(keys)` - Get multiple variables

### Type-Safe Parsers (Recommended)
- `parseNumber(value, options)` / `createNumberParser(options)`
- `parseUrl(value, options)` / `createUrlParser(protocol)`
- `parseEnum(value, allowed, caseInsensitive)` / `createEnumParser(allowed, caseInsensitive)`
- `parsePostgresUrl(value)`
- `parseRedisUrl(value)`
- `parseBoolean(value)`

### Schema-Based API (NEW)
- `defineEnvSchema(schema)` - Define environment schema
- `envString(options)` - String schema helper
- `envNumber(options)` - Number schema helper
- `envBoolean(options)` - Boolean schema helper
- `envUrl(options)` - URL schema helper
- `envEnum(allowed, options)` - Enum schema helper
- `envJson(options)` - JSON schema helper
- `createEnvRegistry(schema)` - Create registry from schema
- `EnvRegistry.get(key)` - Get variable from registry
- `EnvRegistry.require(key)` - Get required variable from registry
- `EnvRegistry.validate()` - Validate all variables
- `EnvRegistry.getAllSchemas()` - Get all schemas
- `EnvRegistry.getByCategory(category)` - Get schemas by category
- `EnvRegistry.getRequired()` - Get required variables
- `EnvRegistry.getSensitive()` - Get sensitive variables
- `EnvRegistry.getServerOnly()` - Get server-only variables
- `EnvRegistry.getClientAccessible()` - Get client-accessible variables
- `generateMarkdownDocs(registry)` - Generate markdown documentation
- `generateEnvExample(registry)` - Generate .env.example file
- `generateJsonDocs(registry)` - Generate JSON documentation
- `isClientAccessible(key)` - Check if variable is client-accessible
- `isServerOnly(key)` - Check if variable is server-only

### Boolean Validators (Deprecated)
- `validateUrl()` - Use `parseUrl` instead
- `validateNumber()` - Use `parseNumber` instead
- `validateEnum()` - Use `parseEnum` instead
- `validatePostgresUrl()` - Use `parsePostgresUrl` instead
- `validateRedisUrl()` - Use `parseRedisUrl` instead

### Other Validators (Still Valid)
- `validateBoolean()`, `parseBoolean()`
- `validatePattern()`, `createPatternValidator()`
- `validateNotEmpty()`
- `validateMinLength()`, `createMinLengthValidator()`
- `combineValidators()`

---

## Related

- [dotenv](https://github.com/motdotla/dotenv) - Underlying .env parser
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables) - Inspiration for priority system
- [@spfn/core](../../README.md) - Main package documentation
- [Environment Guide](../../../docs/guides/environment.md) - User-facing documentation