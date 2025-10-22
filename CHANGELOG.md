# Changelog

All notable changes to SPFN will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0-alpha.45] - 2025-10-22

### Fixed

#### @spfn/core

- **Route Type Inference**: Fixed contract-based type inference in route handlers
  - `RouteHandler` is now generic: `RouteHandler<TContract>`
  - `app.bind()` correctly passes contract types to handler
  - `c.params`, `c.query`, `c.data()`, `c.json()` now properly typed from contract
  - No more `any` types in route handlers - full end-to-end type safety
  - Example:
    ```typescript
    const contract = {
      method: 'POST' as const,
      params: Type.Object({ id: Type.String() }),
      body: Type.Object({ name: Type.String() }),
      response: Type.Object({ success: Type.Boolean() })
    };

    app.bind(contract, async (c) => {
      const { id } = c.params;        // ✅ { id: string }
      const body = await c.data();    // ✅ { name: string }
      return c.json({ success: true }); // ✅ Type-checked
    });
    ```

## [0.1.0-alpha.44] - 2025-10-22

### Changed

#### @spfn/core

- **Repository Pattern Separation**: Repository classes must now be in separate files from entities
  - Entity files (`src/server/entities/*.ts`) now only contain table schemas and type definitions
  - Repository classes moved to `src/server/repositories/*.repository.ts`
  - Updated README.md with new pattern: separate entity definition, repository creation, and route usage
  - Example structure:
    ```
    src/server/
    ├── entities/users.ts          # Schema + types only
    ├── repositories/users.repository.ts  # Repository class
    └── routes/users/index.ts      # Import from repositories/
    ```

- **Drizzle ORM Constraint Syntax**: Updated to latest array-based syntax
  - Old: `(table) => ({ indexName: index().on(...) })`
  - New: `(table) => [ index().on(...), unique().on(...) ]`
  - Removed property names from constraints (no longer needed)

- **Transactional Middleware**: Fixed incorrect usage examples
  - Correct: `app.bind(contract, [Transactional()], handler)`
  - Fixed in core README.md and middleware documentation

#### spfn

- **Templates**: Updated all templates to follow new Repository separation pattern
  - `templates/server/entities/README.md` now shows 3-step pattern
  - All example code updated with correct import paths

## [0.1.0-alpha.43] - 2025-10-21

### Fixed

#### @spfn/core

- **Client Path Combination**: Fixed trailing slash issue in API requests
  - Added `combinePaths()` method to properly combine basePath and contract.path
  - Prevents duplicate slashes: `/organizations` + `/` now correctly becomes `/organizations` instead of `/organizations/`
  - Examples:
    - `combinePaths('/organizations', '/')` → `/organizations` (was `/organizations/` causing 404)
    - `combinePaths('/organizations', '/:id')` → `/organizations/:id`
    - `combinePaths('/', '/health')` → `/health`
  - Fixes 404 errors when calling routes with basePath and contract.path both ending/starting with `/`

## [0.1.0-alpha.42] - 2025-10-21

### Fixed

#### @spfn/core

- **Client File-Based Routing**: Fixed critical bug where API client was calling wrong paths
  - Changed `client.call(contract, options)` to `client.call(basePath, contract, options)`
  - Contract client now accepts basePath as first parameter (e.g., `/organizations`)
  - Codegen now passes full path from file-based routing to client.call()
  - Example: `api.organizations.list()` now correctly calls `/organizations/` instead of `/`
  - Fixed issue where all routes were being called with contract's relative path only

- **Client Code Generator**: Updated to pass basePath in generated API client
  - Generated code now: `client.call('/organizations', getOrganizationsContract)`
  - Previously: `client.call(getOrganizationsContract)` (incorrect, used `/` only)
  - Properly combines file-based route path with contract path

### Breaking Changes

#### @spfn/core

- **ContractClient.call() signature changed**:
  - Old: `call(contract, options?)`
  - New: `call(basePath, contract, options?)`
  - This change is only breaking for manual client.call() usage
  - Auto-generated API clients will work after regeneration

## [0.1.0-alpha.41] - 2025-10-21

### Added

#### @spfn/core

- **Environment Loading**: Next.js-style environment variable management
  - Load `.env` and `.env.local` when NODE_ENV is not set
  - Support custom NODE_ENV values (staging, qa, uat, local, etc.)
  - Warn when NODE_ENV is defined in .env files (recommend CLI-based setting)
  - Prevent duplicate `.env.local` loading when `NODE_ENV=local`
  - Updated test coverage with 5 new tests for NODE_ENV handling

#### spfn

- **Auto NODE_ENV Setting**: CLI commands automatically set NODE_ENV (Next.js style)
  - `spfn dev` → `NODE_ENV=development`
  - `spfn build` → `NODE_ENV=production`
  - `spfn start` → `NODE_ENV=production`

### Changed

#### @spfn/core

- **Logger Configuration**: Removed NODE_ENV validation warnings
  - Accept any NODE_ENV value without warnings
  - Removed restrictive validation (development/production/test only)
  - Updated test coverage to verify no warnings on custom NODE_ENV

- **Pino Adapter**: Simplified transport configuration
  - Removed `pino-pretty` transport to avoid worker thread errors
  - Use default JSON output for all environments
  - Fixed "unable to determine transport target" error

- **Environment Loader**: Enhanced flexibility and Next.js compatibility
  - Default `nodeEnv` from `'development'` to `''` (empty string)
  - Load `.env.local` by default when NODE_ENV is not set
  - Support `.env.{NODE_ENV}` pattern for any custom environment name

### Fixed

#### @spfn/core

- **TypeScript Errors**: Fixed `warnings` field type in `LoadResult`
  - Changed from `warnings?: string[]` to `warnings: string[]`
  - Fixed TS18048 errors in loader.ts

- **Logger Transport Error**: Resolved pino-pretty module resolution issue
  - Error: "unable to determine transport target for pino-pretty"
  - Solution: Removed transport configuration, use native pino output

## [0.1.0-alpha.40] - 2025-10-21

### Added

#### @spfn/core

- **DB Integration Tests (40 tests)**: Comprehensive test coverage for database module
  - Transaction context tests: AsyncLocalStorage-based transaction propagation, nested transactions, concurrent isolation
  - Transaction middleware tests: Hono auto-commit/rollback, timeout enforcement, error handling
  - Repository tests: CRUD operations, transaction integration, multi-repository transactions, read/write separation
  - Test fixtures: Shared test schema for PostgreSQL integration tests

- **Middleware Tests (17 tests)**: Error handler middleware test coverage
  - Basic error handling with statusCode
  - Error details inclusion
  - Stack trace handling (environment-based, includeStack option)
  - HTTP status code handling (400-level, 500-level)
  - Logging options
  - Edge cases (no message, no name, complex details)
  - Response format validation

### Changed

#### @spfn/core

- **Test Coverage**: Increased from 35% to 40%+ with 518+ total tests
  - Cache module: 70 tests (previously 15+)
  - DB module: 40 tests (previously 0)
  - Middleware module: 30+ tests (previously 13+)

- **Test Infrastructure**: Improved test isolation and configuration
  - Fixed docker-compose.test.yml path in package.json
  - Added fileParallelism and isolate options to vitest.integration.config.ts
  - Updated test scripts to use integration config for cache, db, and server tests

- **Documentation**: Updated TESTING.md with current test counts and coverage

### Fixed

#### @spfn/core

- **DB Repository Type Issues**: Fixed TypeScript compatibility
  - Removed unused `DrizzleTableWithUtils` interface
  - Changed Repository to use `PgTable` directly for better type compatibility
  - Removed unnecessary `getTableName()` method requirement

- **Cache Tests**: Updated redis-manager tests to match actual logger usage pattern

- **Client Tests**: Updated for new contract API
  - Contracts now include `path` and `method` properties
  - Updated test expectations to match new API structure

- **Codegen Tests**: Updated for architectural changes
  - contract-scanner: Updated for co-located contracts pattern (routes/**/contract.ts)
  - client-generator: Updated for singleton client pattern

## [0.1.0-alpha.32] - 2025-10-19

### Changed

#### @spfn/core

- **Development Mode**: Disabled auto-restart on file changes in dev script
  - Removed `--watch` flag from `dev` script in package.json
  - Build now requires manual restart after code changes
  - Provides more control during development and testing

## [0.1.0-alpha.31] - 2025-10-19

### Fixed

#### @spfn/core

- **Drizzle ORM v0.44.6 Compatibility**: Fixed compatibility with Drizzle ORM v0.44.6
  - Updated `Repository.executeWithMonitoring()` to use `Symbol.for('drizzle:Name')` instead of deprecated `table._.name`
  - Added proper type casting `(this.table as any)[Symbol.for('drizzle:Name')]` to avoid TypeScript errors
  - Fixed in both slow query logging and error logging paths

- **Repository Logging Stability**: Improved error handling in repository monitoring
  - Wrapped logging code in try-catch blocks to prevent logging failures from breaking database operations
  - Logging errors now fallback to `console.error()` without affecting actual queries
  - Ensures that slow query detection or logging issues never cause query failures

- **Drizzle Table Schema**: Fixed deprecated `pgTable` signature
  - Updated table definitions to return arrays instead of objects for indexes/constraints
  - Changed from `(table) => ({ index: ... })` to `(table) => [index(...)]`
  - Fixes TS6387 deprecation warnings in Drizzle ORM v0.44+

### Technical Details

**Drizzle ORM Breaking Change**:
- Drizzle v0.44.6 removed the `_` metadata property from table objects
- Now uses Symbol-based metadata: `Symbol.for('drizzle:Name')`
- This change affected all table name access in repository logging

**Before**:
```typescript
table: this.table._.name  // ❌ undefined in v0.44.6
```

**After**:
```typescript
table: (this.table as any)[Symbol.for('drizzle:Name')] as string  // ✅ Works
```

## [0.1.0-alpha.30] - 2025-10-18

### Changed

#### spfn CLI

- **Simplified TypeScript Build Configuration**: Use `src/server/tsconfig.json` directly for builds
  - `init.ts`: Generate tsconfig.json with build settings included (outDir, rootDir, declaration, sourceMap)
  - `build.ts`: Simplified to use `src/server/tsconfig.json` directly instead of generating temporary config
  - Removed `.spfn/tsconfig.server.json` generation
  - Single source of truth for TypeScript configuration
  - Better developer experience with consistent configuration across dev and build

### Technical Details

**Previous Approach (v0.1.0-alpha.29)**:
- Generated tsconfig.json with `noEmit: true` during init
- Build process created temporary `.spfn/tsconfig.server.json` with overrides
- Path resolution issues when copying relative paths to different directory

**New Approach (v0.1.0-alpha.30)**:
- Generate tsconfig.json with build settings during init
- Build process uses `src/server/tsconfig.json` directly
- No temporary files needed
- All paths remain relative to `src/server/`

**Generated Configuration** (`src/server/tsconfig.json`):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "WebWorker"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "sourceMap": true,
    "outDir": "../../.spfn/server",
    "rootDir": ".",
    "baseUrl": ".",
    "paths": {
      "@/*": ["../../src/*"]
    },
    // ... other settings
  }
}
```

**Benefits**:
- Simpler build process
- No path resolution issues
- IDE and build use same configuration
- Easier to customize for developers

---

## [0.1.0-alpha.29] - 2025-10-18

### Changed

#### spfn CLI

- **Server TypeScript Configuration**: Create `src/server/tsconfig.json` during project initialization
  - `init.ts`: Generate tsconfig.json in `src/server/` directory on `spfn init` or `spfn create`
  - Configuration optimized for SPFN server development with IDE support
  - Includes path mapping for `@/*` imports and proper module resolution
  - `build.ts`: Build process now uses existing `src/server/tsconfig.json` as base
    - Falls back to default configuration if tsconfig.json doesn't exist (backward compatibility)
    - Overrides build-specific settings (noEmit, outDir, rootDir, declaration, sourceMap)
    - Removed automatic generation of tsconfig on every build

### Technical Details

**Generated Configuration** (`src/server/tsconfig.json`):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "WebWorker"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowJs": true,
    "resolvePackageJsonExports": true,
    "resolvePackageJsonImports": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["../../src/*"]
    }
  },
  "include": ["./**/*"],
  "exclude": ["../../node_modules"]
}
```

**Benefits**:
- Better IDE support for server code (autocomplete, type checking, imports)
- Developers can customize TypeScript settings for server code
- Build process respects user customizations while applying necessary overrides
- One-time generation during init instead of regenerating on every build

---

## [0.1.0-alpha.28] - 2025-10-18

### Fixed

#### @spfn/core

- **Route Scanner**: Fixed hyphenated route paths not being converted to camelCase in generated API client
  - Routes like `/videos/upload-and-analyze` now correctly generate `videosUploadAndAnalyze` instead of invalid `videosUpload-and-analyze`
  - Added `toCamelCase()` function to handle hyphen and underscore conversion
  - Applies to both route path segments and file names

## [0.1.0-alpha.25] - 2025-10-17

### Fixed

#### @spfn/core

- **Repository Constructor**: Fixed table detection mechanism that was causing `TypeError: writeDb.insert is not a function`
  - Changed from string-based `'name' in dbOrTable` check to Symbol-based detection using `Symbol.for('drizzle:Name')`
  - Drizzle ORM uses internal Symbols for table identification, not string properties
  - Implemented lazy database initialization to avoid constructor side effects
  - Updated `getReadDb()` to call `getRawDb()` instead of using `this.db`

- **Database Manager (tsx --watch compatibility)**: Fixed "Database not initialized" errors in development mode
  - Root cause: `tsx --watch` creates isolated module contexts on reload
  - Module-level singleton variables were not shared across contexts
  - Migrated all database singletons from module-level to `globalThis` properties
  - Added accessor functions for encapsulated access to global state
  - Fixed naming conflict: renamed `getHealthCheckConfig` → `buildHealthCheckConfig` and `getMonitoringConfig` → `buildMonitoringConfig`

### Added

#### @spfn/core

- **Documentation**: Comprehensive documentation for globalThis pattern and Repository fixes
  - `database-manager.md`: New section "Module Context Isolation (tsx --watch Compatibility)"
    - Explains why tsx --watch creates module context isolation
    - Documents globalThis singleton pattern implementation
    - Architecture decision rationale (tsx --watch + globalThis vs alternatives)
    - Debugging guide for module context issues
    - Best practices for custom singleton patterns
  - `repository.md`: Enhanced constructor documentation
    - "Table Detection Mechanism" section explaining Symbol-based detection
    - "Lazy Database Resolution" section explaining deferred initialization
    - Internal implementation details and benefits

### Technical Details

**Problem 1 - Repository Constructor Bug**:

Drizzle ORM table objects use `Symbol.for('drizzle:Name')` for identification, not a string `name` property:

```typescript
// ❌ BROKEN: Doesn't work (table.name is a Symbol)
const isTable = 'name' in dbOrTable && typeof dbOrTable.name === 'string';

// ✅ CORRECT: Uses Drizzle's internal Symbol
const isTable = Symbol.for('drizzle:Name') in dbOrTable;
```

**Problem 2 - Module Context Isolation**:

When `tsx --watch` reloads files, it creates new module contexts with fresh module-level variables:

```typescript
// ❌ BROKEN: Module-level singleton
let writeInstance: PostgresJsDatabase | undefined;

export function getDatabase() {
    return writeInstance; // undefined in reloaded modules!
}

// ✅ CORRECT: globalThis singleton
declare global {
    var __SPFN_DB_WRITE__: PostgresJsDatabase | undefined;
}

const getWriteInstance = () => globalThis.__SPFN_DB_WRITE__;

export function getDatabase() {
    return getWriteInstance(); // Works across all module contexts!
}
```

**Debug Evidence**:

```
[DEBUG]: getDatabase() called with type=write, writeInstance=false  // Route context
[DEBUG]: getDatabase() called with type=write, writeInstance=true   // Server context
```

Database instances existed in server initialization context but were undefined in dynamically loaded route handlers.

**Solution**:

All stateful singletons migrated to globalThis:
- `__SPFN_DB_WRITE__` - Primary database instance
- `__SPFN_DB_READ__` - Read replica instance
- `__SPFN_DB_WRITE_CLIENT__` - Primary client connection
- `__SPFN_DB_READ_CLIENT__` - Replica client connection
- `__SPFN_DB_HEALTH_CHECK__` - Health check interval timer
- `__SPFN_DB_MONITORING__` - Monitoring configuration

All public functions (`getDatabase`, `initDatabase`, `closeDatabase`, `startHealthCheck`, `stopHealthCheck`, `getDatabaseInfo`, `getDatabaseMonitoringConfig`) now use accessor functions instead of direct variable access.

**Why tsx --watch + globalThis?**

Alternatives considered:
1. **chokidar + process restart**: Slower reload, loses all state, more resource intensive
2. **chokidar + cache invalidation**: Complex implementation, loses tsx optimization
3. **tsx --watch + globalThis**: ✅ Best balance of speed, simplicity, and developer experience

This is a standard pattern - Next.js uses similar module context isolation for hot reload.

---

## [0.1.0-alpha.24] - 2025-10-17

### Added

#### @spfn/core
- **Environment Module Export**: Added `./env` submodule to package.json exports for external access
  - Enables CLI and external tools to use centralized environment loader
  - Full TypeScript support with proper type definitions

### Changed

#### spfn CLI
- **Centralized Environment Loader Integration**: All CLI commands now use `@spfn/core/env` module
  - `dev.ts`: Generated server.mjs loads environment variables BEFORE importing server module
    - Fixes logger singleton initialization with correct NODE_ENV
    - Ensures standard dotenv priority: `.env` → `.env.{NODE_ENV}` → `.env.local` → `.env.{NODE_ENV}.local`
  - `db.ts`: Loads environment variables before checking DATABASE_URL
  - `build.ts`: Generated prod-server.mjs uses centralized loader
    - Supports both .env files AND container/kubernetes env vars

### Fixed

#### @spfn/core
- **TypeScript Compilation**: Added `drizzle-kit` to devDependencies
  - Fixes `TS2307: Cannot find module 'drizzle-kit'` error in `drizzle.config.ts`

### Technical Details

**Problem**: Logger singleton was created at module import time, BEFORE environment variables were loaded:
```javascript
// OLD (incorrect order)
import { startServer } from '@spfn/core/server';  // Logger created here (NODE_ENV undefined)
config({ path: '.env.local' });                   // NODE_ENV loaded here (too late!)
```

**Solution**: Load environment variables first using dynamic import:
```javascript
// NEW (correct order)
const { loadEnvironment } = await import('@spfn/core/env');
loadEnvironment({ debug: true });                 // NODE_ENV loaded first
const { startServer } = await import('@spfn/core/server');  // Logger created with correct NODE_ENV
```

**Benefits**:
- Logger debug logs now appear correctly in development mode
- Database initialization logs visible at server startup
- Consistent environment loading across all SPFN tools
- Standard dotenv priority applied everywhere

---

## [0.1.0-alpha.23] - 2025-10-17

### Fixed

#### @spfn/core
- **Database Initialization**: Server now fails to start if DATABASE_URL is configured but connection fails
  - `factory.ts`: Throws error on connection failure instead of returning undefined
  - `manager.ts`: Throws error on connection test failure
  - Prevents server from starting with misconfigured database
  - Ensures database is properly initialized at server startup, not on first request
  - Related: [Issue #9](https://github.com/spfn/spfn/issues/9) - Server lifecycle hooks for infrastructure initialization

### Technical Details

**Before (v0.1.0-alpha.22)**:
- Database initialization was lazy (on first `getRepository()` call)
- Connection failures were silent (returned `undefined`)
- Server would start even with invalid DATABASE_URL
- Database errors only appeared on first API request

**After (v0.1.0-alpha.23)**:
```typescript
// factory.ts - Connection failure is now fatal
catch (error) {
  // ... logging ...
  throw new Error(`Database connection failed: ${message}`, { cause: error });
}

// manager.ts - Connection test failure is now fatal
catch (error) {
  await closeDatabase();
  throw new Error(`Database connection test failed: ${message}`, { cause: error });
}
```

**Behavior**:
- If DATABASE_URL is **not set**: Server starts normally (warning logged)
- If DATABASE_URL is **set but invalid**: Server fails to start with clear error message
- Database connection is **tested at startup** (`SELECT 1` query)
- Prevents "database not initialized" errors during request handling

---

## [0.1.0-alpha.22] - 2025-10-17

### Added

#### @spfn/core
- **Centralized Environment Variable Management**: New `@spfn/core/env` module for standardized environment loading
  - Singleton pattern to prevent duplicate loading
  - Standard dotenv file priority: `.env` → `.env.{NODE_ENV}` → `.env.local` → `.env.{NODE_ENV}.local`
  - Support for custom paths and required variable validation
  - Comprehensive validation utilities (URL, number, boolean, enum, pattern, etc.)
  - Full TypeScript support with proper types
  - 63 tests with 100% pass rate

### Changed

#### @spfn/core
- **Database Module**: Updated to use centralized environment loader
  - `factory.ts`: Replaced direct `dotenv` usage with `loadEnvironment()` from `@spfn/core/env`
  - Better error handling and debug logging
  - Consistent environment variable loading across all modules
- **Migration Script**: Updated `migrate.ts` to use centralized loader
- **Drizzle Config**: Updated `drizzle.config.ts` to use centralized loader

### Technical Details

**New Module** (`@spfn/core/env`):
```typescript
// Core functions
export {
  loadEnvironment,      // Load environment files with standard priority
  getEnvVar,           // Get variable with optional validation
  requireEnvVar,       // Get required variable (throws if missing)
  hasEnvVar,           // Check if variable exists
  getEnvVars,          // Get multiple variables at once
  isEnvironmentLoaded, // Check if environment is loaded
  resetEnvironment,    // Reset for testing
} from '@spfn/core/env';

// Validation utilities
export {
  validateUrl, validatePostgresUrl, validateRedisUrl,
  validateNumber, validateBoolean, validateEnum,
  validatePattern, validateNotEmpty, validateMinLength,
  parseBoolean, combineValidators,
  // ... and factory functions
} from '@spfn/core/env';
```

**Usage Example**:
```typescript
import { loadEnvironment, requireEnvVar } from '@spfn/core/env';

// Load with standard priority
loadEnvironment({ debug: true });

// Get required variables
const dbUrl = requireEnvVar('DATABASE_URL');

// With validation
const port = getEnvVar('PORT', {
  validator: createNumberValidator({ min: 1, max: 65535, integer: true }),
  default: '3000',
});
```

**Environment File Priority**:
1. `.env` - Base configuration (committed)
2. `.env.{NODE_ENV}` - Environment-specific
3. `.env.local` - Local overrides (gitignored, highest priority)
4. `.env.{NODE_ENV}.local` - Local environment-specific

**Benefits**:
- Single source of truth for environment configuration
- Prevents duplicate loading with singleton pattern
- Better debugging with consistent logging
- Type-safe variable access with validation
- Standard dotenv priority across all modules

---

## [0.1.0-alpha.21] - 2025-10-16

### Added

#### @spfn/core
- **Custom Generator Support**: Load TypeScript generators at runtime via jiti
  - Dynamic import of `.ts` files for custom generators
  - Support for both relative and absolute paths
  - `jiti` dependency added for TypeScript runtime execution
- **Array-based Generator Configuration**: More flexible configuration format
  - `generators` field now accepts array of generator configs
  - Support for both built-in (`{ name: 'contract' }`) and custom (`{ path: '...' }`) generators
  - Backward compatible with existing configurations

#### spfn CLI
- **`spfn codegen` command group**: New CLI commands for code generation management
  - `spfn codegen init`: Initialize `.spfnrc.json` with default configuration
  - `spfn codegen list` (alias: `ls`): List all registered generators with patterns
  - `spfn codegen run`: Execute generators once without watch mode
- **Enhanced CLI Help**: Consistent command structure following `db` pattern

### Changed

#### @spfn/core
- **Config Loader Improvements**:
  - `createGeneratorsFromConfig()` is now async and requires `cwd` parameter
  - Supports loading custom TypeScript generators via jiti
  - Better error handling for generator loading failures
  - Updated default configuration to use array format

#### spfn CLI
- Updated `dev` command to await `createGeneratorsFromConfig()`
- Improved orchestrator entry point generation

### Fixed
- Custom generators can now be loaded from TypeScript files (not just compiled JS)
- Generator path resolution works correctly with relative paths

### Configuration Example

**New array-based format** (`.spfnrc.json`):
```json
{
  "codegen": {
    "generators": [
      { "name": "contract", "enabled": true },
      { "path": "./src/generators/my-generator.ts" }
    ]
  }
}
```

### Technical Details

**New Dependencies**:
- `jiti@^2.6.1` - TypeScript runtime loader for custom generators

**Updated API**:
```typescript
// Config loader is now async and requires cwd
export async function createGeneratorsFromConfig(
  config: CodegenConfig,
  cwd: string
): Promise<Generator[]>
```

**Custom Generator Example**:
```typescript
// src/generators/my-generator.ts
import type { Generator, GeneratorOptions } from '@spfn/core/codegen';

export default function createMyGenerator(): Generator {
  return {
    name: 'my-generator',
    watchPatterns: ['src/data/**/*.ts'],

    async generate(options: GeneratorOptions): Promise<void> {
      // Your generation logic
    },

    async onFileChange(filePath: string, event: 'add' | 'change' | 'unlink'): Promise<void> {
      // Optional: Custom file change handler
      await this.generate({ cwd: process.cwd(), debug: false });
    }
  };
}
```

---

## [0.1.0-alpha.20] - 2025-10-16

### Added

#### @spfn/core
- **Codegen Orchestrator System**: New orchestrator pattern for managing multiple code generators
  - `CodegenOrchestrator` class for centralized file watching and generator management
  - `Generator` interface for creating pluggable code generators
  - Configuration-based setup via `.spfnrc.json` or `package.json`
  - Built-in error resilience (one generator failure doesn't stop others)
  - Performance optimizations (debouncing, concurrent prevention, single watcher)
- **Config Loader**: `loadCodegenConfig()` and `createGeneratorsFromConfig()` functions
- **Contract Generator**: Refactored to use new Generator interface
  - Configurable routes directory, output path, and base URL
  - Automatic type-safe API client generation from route contracts
- **Documentation**: Comprehensive codegen documentation at `packages/core/src/codegen/README.md`
  - Usage examples for one-time generation and watch mode
  - Custom generator creation guide
  - API reference for all codegen exports
  - Best practices and troubleshooting

#### spfn CLI
- **Integrated Orchestrator**: `spfn dev` command now uses CodegenOrchestrator
  - Automatic code generation on startup
  - Watch mode for continuous regeneration during development
  - Runs alongside Next.js dev server

### Changed

#### @spfn/core
- Refactored code generation system from monolithic `watchAndGenerate` to modular orchestrator pattern
- Contract generator now implements `Generator` interface
- Improved file watching with micromatch pattern matching
- Added `micromatch` dependency for glob pattern support

#### spfn CLI
- Updated `dev.ts` to generate orchestrator-based watcher entry instead of using `watchAndGenerate`

### Technical Details

**New Exports** (`@spfn/core/codegen`):
```typescript
// Orchestrator & Generator system
export { CodegenOrchestrator } from './orchestrator.js';
export { createContractGenerator } from './generators/contract-generator.js';
export { loadCodegenConfig, createGeneratorsFromConfig } from './config-loader.js';

// Types
export type { Generator, GeneratorOptions } from './generator.js';
export type { OrchestratorOptions } from './orchestrator.js';
export type { ContractGeneratorConfig } from './generators/contract-generator.js';
export type { CodegenConfig } from './config-loader.js';
```

**Configuration Example** (`.spfnrc.json`):
```json
{
  "codegen": {
    "generators": {
      "contract": {
        "enabled": true,
        "routesDir": "src/server/routes",
        "outputPath": "src/lib/api.ts",
        "baseUrl": "http://localhost:8790"
      }
    }
  }
}
```

### Migration Guide

The old `watchAndGenerate` function is still available but deprecated. Projects using `spfn dev` will automatically use the new orchestrator system.

For programmatic usage, migrate from:
```typescript
// Old
import { watchAndGenerate } from '@spfn/core/codegen';
await watchAndGenerate({ routesDir: 'src/server/routes' });
```

To:
```typescript
// New
import { CodegenOrchestrator, loadCodegenConfig, createGeneratorsFromConfig } from '@spfn/core/codegen';

const config = loadCodegenConfig(process.cwd());
const generators = createGeneratorsFromConfig(config);
const orchestrator = new CodegenOrchestrator({ generators, cwd: process.cwd() });
await orchestrator.watch();
```

---

## [0.1.0-alpha.19] - Previous Release

See git history for previous changes.
