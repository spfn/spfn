# Changelog

All notable changes to SPFN will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note**: For changelog history prior to v0.1.0-alpha.60, see [CHANGELOG-v0.0.x-alpha.md](./CHANGELOG-v0.0.x-alpha.md)

## [0.1.0-alpha.68] - 2025-11-02

### Changed

#### @spfn/core

- **Codegen Folder Structure Refactoring**: Reorganized codegen module for better clarity and extensibility
  - Created `core/` directory for system files (orchestrator, generator interface, config loader, types)
  - Created `built-in/` directory for built-in generators
  - Moved contract generator to `built-in/contract/`
  - Renamed files for clarity:
    - `client-generator.ts` → `emitter.ts` (code generation)
    - `contract-scanner.ts` → `scanner.ts`
    - `route-scanner.ts` → `helpers.ts` (resource grouping utilities)
  - Prepared structure for future built-in generators (e.g., auth, migrations)
  - Updated all import paths to reflect new structure

## [0.1.0-alpha.67] - 2025-11-02

### Changed

#### @spfn/cms

- **Contract Path Prefixing**: All CMS contract paths now explicitly include `/_cms` prefix
  - `GET /labels` → `GET /_cms/labels`
  - `GET /labels/:id` → `GET /_cms/labels/:id`
  - `POST /values/:labelId` → `POST /_cms/values/:labelId`
  - `GET /values/:labelId/:version` → `GET /_cms/values/:labelId/:version`
  - `GET /published-cache` → `GET /_cms/published-cache`
  - Ensures contract paths match the actual route mounting point

#### @spfn/core

- **Prefix Validation for External Routes**: Auto-loader now validates contract paths against package prefix
  - When `loadExternalRoutes()` is called with a prefix parameter, contract paths must start with that prefix
  - Errors with clear hints if prefix is missing (e.g., "Contract paths should start with '/auth'. Example: path: '/auth/login'")
  - Prevents mismatch between backend route mounting and client API calls
  - Existing routes without prefix will fail validation until contracts are updated

### Fixed

#### @spfn/core

- **Auto-loader Tests**: Updated external routes tests to reflect new prefix validation behavior
  - Test contract paths now include required prefix
  - Added test case for prefix validation error scenario

## [0.1.0-alpha.66] - 2025-11-02

### Fixed

#### @spfn/cms

- **Server Actions Bundling**: Fixed "use server" directive bundling issue
  - Removed Server Actions exports from `server.ts` to prevent Turbopack build errors
  - Server Actions (`getLocale`, `setLocale`, etc.) now only exported from `actions.ts`
  - `server.ts` now only exports constants and server components
  - Resolves "Server Actions must be async functions" error in Next.js 15 with Turbopack

## [0.1.0-alpha.65] - 2025-11-02

### Added

#### @spfn/core

- **API Response Helpers**: Optional standardized response utilities
  - `success()`, `error()`, `paginated()` helper functions
  - `ApiSuccessResponse<T>`, `ApiErrorResponse`, `ApiResponse<T>` types
  - TypeBox schema helpers: `ApiSuccessSchema()`, `ApiErrorSchema()`, `ApiResponseSchema()`
  - Completely optional - use when desired for consistency

- **Route Module Enhancements**:
  - Prefix support for external package routes (e.g., `/auth`, `/cms`)
  - `loadExternalRoutes()` accepts prefix parameter for mounting
  - Default ErrorHandler now registered in all SPFN apps
  - Automatic mounting with package.json `spfn.prefix` field

- **Schema Module**: 6 new helper functions for common patterns
  - New utilities for schema composition and validation
  - Enhanced type-safe schema operations

- **Codegen Improvements**:
  - Scope-based API naming to avoid conflicts (e.g., `cmsApi`, `authApi`)
  - Package prefix support from package.json
  - `runOn` option to control when generators execute: 'watch' | 'manual' | 'build' | 'start'
  - Improved module generation with better defaults

- **Build Configuration**:
  - Submodule exports for better tree-shaking
  - Coverage configuration for testing

#### @spfn/cms

- Codegen-based API client generation
  - Auto-generated type-safe API clients via `@spfn/core:contract`
  - Generated API structure: CmsLabels, CmsLabelsByKey, CmsPublishedCache, CmsValues
  - All types auto-generated from contracts using InferContract

#### spfn CLI

- **Module Generation Enhancements**:
  - Scope selection when generating new modules (@spfn, @mycompany, etc.)
  - Comprehensive development guide in generated README
  - Example custom generator in new modules
  - Helper scripts (codegen, test, docker) in generated packages
  - 3-layer architecture templates (lib/, server/, client/)

### Changed

#### @spfn/core

- **Error Handling**:
  - Renamed `ValidationError` to `ConstraintViolationError` for clarity
  - Added HTTP `ValidationError` for request validation errors
  - Updated ErrorResponse to include `success: false` field

- **Cache Module**: Migrated from Redis to Valkey/Cache with graceful degradation
  - Support for Valkey (Redis fork)
  - Graceful fallback when cache is unavailable
  - Improved error handling

- **Codegen Architecture**:
  - Reorganized folder structure:
    - Created `scanners/` directory for contract and route scanners
    - Created `generators/contract/` directory
    - Improved imports (removed `.js` extensions)
  - Improved generator architecture with runOn and trigger pattern
  - Better separation of concerns

- **Middleware Module**: Export ErrorResponse type for better type safety

#### Package Structure

- **3-Layer Architecture**: Restructured cms, auth, and cli packages
  - `lib/`: Shared code (contracts, types, constants)
  - `server/`: Server-only code (entities, routes, repositories)
  - `client/`: Client-only code (hooks, store, components)
  - Updated all import paths and build configurations

### Fixed

#### @spfn/core

- TypeScript build errors across multiple modules
- watch-generate imports after folder restructure
- Logger test failures
- Server TypeScript type errors (MockInstance vs SpyInstance)
- Graceful skip for integration tests without PostgreSQL

### Testing

#### @spfn/core

- **Route Module**:
  - Updated auto-loader tests for contract-based routing
  - Added function-routes discovery tests
  - Enhanced bind and create-app test coverage

- **Middleware Module**:
  - Added 20 new maskSensitiveData tests
  - Comprehensive coverage of edge cases and circular references

- **Server Module**:
  - Added comprehensive helper and banner tests
  - Updated documentation with test coverage

- **Database Module**:
  - Added comprehensive tests for utility modules
  - Comprehensive test suite with improved type system
  - Reorganized transaction tests with 100% coverage

- **Codegen Module**:
  - Improved test coverage to 85.68% (47 → 61 tests)
  - Added 14 new tests across all subsystems

### Documentation

#### Core Concepts

- Added comprehensive framework documentation
- Updated db module documentation with schema and testing info
- Added comprehensive README for schema module

#### Modules

- **Route Module**: Added API Response helpers section with examples
- **Errors Module**: Added comprehensive test coverage section
- **Env Module**: Added comprehensive README documentation
- **Codegen Module**:
  - Updated documentation for new architecture
  - Added comprehensive custom generators guide

#### Philosophy & Architecture

- Added comprehensive philosophy documentation
  - Rails-inspired principles (Convention over Config, DRY, Omakase)
  - 7 core principles: Single Source of Truth, Proven Over Novel, Type Safety First
  - Design decisions: Why File-Based Routing, Why Contract-First, Why Single Project
  - What Superfunction Is Not section
- Renamed architecture/ → philosophy/ folder
- Improved deployment options documentation
  - Option 1: All-in-one deployment (recommended)
  - Option 2: Split deployment (Vercel + separate server)

#### Ecosystem

- Added module creation documentation
  - 8-step development workflow with code examples
  - Configuration options and API name generation
  - Custom generator examples and best practices
  - Publishing guide and troubleshooting section

## [0.1.0-alpha.64] - 2025-11-01

### Changed

#### @spfn/core

- **Codegen Architecture Simplification**:
  - **Removed legacy routes/ directory scanning**: Now only scans `lib/contracts/` directory
  - **Removed single file output mode**: Split-by-resource is now the only output mode
  - **Removed legacy generator naming**: Only `package:name` format supported (e.g., `@spfn/core:contract`)
  - **Simplified contract scanner**: Cleaner implementation with reduced complexity
  - **Updated all tests**: All 32 codegen tests updated to match new architecture

- **Breaking Changes**:
  - Contract files must be in `src/lib/contracts/` directory (no longer supports `src/routes/`)
  - Generator configuration must use `@spfn/core:contract` format (legacy `contract` name removed)
  - API client always outputs to directory structure (single file mode removed)

## [0.1.0-alpha.63] - 2025-11-01

### Enhanced

#### @spfn/core

- **API Client Generation Improvements**:
  - **Type Reuse**: API method signatures now reuse generated types instead of repeating `InferContract<typeof ...>` expressions
    - Before: `list: (options: { query?: InferContract<typeof getTeamsContract>['query'] }) => ...`
    - After: `list: (options: { query?: GetTeamsQuery }) => ...`
    - Improves code readability and maintainability

  - **Resource-Based File Splitting** (Default enabled):
    - API client now splits into separate files per resource: `src/lib/api/` directory structure
    - Before: Single `api.ts` file with all endpoints
    - After: Individual files (teams.ts, users.ts, etc.) + unified `index.ts`
    - Benefits:
      - ✅ File size stays manageable as your API grows
      - ✅ Types and APIs are co-located by resource
      - ✅ Better tree-shaking for optimal bundle size
      - ✅ Team members can work on different resources in parallel
    - Configuration: `splitByResource` option (default: `true`)
    - Legacy single-file mode still available with `splitByResource: false`

- **Documentation Updates**:
  - Updated codegen README with detailed split mode documentation
  - Added output mode comparison (split vs single file)
  - Added type reuse examples
  - Updated main README to reflect new API structure
  - Updated official documentation site

## [0.1.0-alpha.62] - 2025-10-30

### Fixed

#### @spfn/core

- **ESM File Extension Support**: Fixed comprehensive .mjs extension support across all file scanners
  - `contract-scanner.ts` now scans `.js` and `.mjs` files in lib/contracts/ directory (line 88-97)
  - `contract-scanner.ts` now removes all extensions (.ts, .js, .mjs) when generating import paths (line 401-412)
  - `config-generator.ts` now filters out `index.mjs` files from schema discovery (line 209-215)
  - Resolves codegen failures in production mode where built contract files (.mjs) were not being scanned
  - Ensures consistent file extension handling across all auto-discovery systems

## [0.1.0-alpha.61] - 2025-10-30

### Fixed

#### @spfn/core

- **ESM Config Loading**: Fixed server.config loading to support .mjs extension
  - `startServer()` now checks for `.spfn/server/server.config.mjs` before falling back to `.js`
  - Resolves "Unknown file extension .ts" error in production mode
  - Build output from tsup generates .mjs files which are now properly loaded

## [0.1.0-alpha.60] - 2025-10-29

### Breaking Changes

This is a major architectural update with several breaking changes. Upgrading from previous versions will require code modifications.

#### @spfn/core

- **Contract-based Architecture**: Complete migration from file-based routing to contract-based routing
  - ❌ **Removed**: `basePath` concept - contracts now define absolute paths directly
  - ❌ **Removed**: File-based path inference - routes no longer determine URLs from file structure
  - ✅ **Required**: All contracts must now be centralized in `src/lib/contracts/` directory
  - ✅ **Required**: Route handlers must import contracts using absolute paths (e.g., `@/lib/contracts/users`)
  - See [Migration Guide](#migration-guide-alpha60) below

- **Function Routes System Redesign**: External package routes now loaded directly without basePath
  - ❌ **Removed**: `loadWithBasePath()` method from auto-loader
  - ✅ **Added**: `loadExternalRoutes()` method for direct mounting
  - Function packages (e.g., `@spfn/cms`) now use absolute paths in contracts
  - Routes from function packages mount directly to main app (e.g., `/cms/labels`)

- **Strict Route File Convention**: Only `index.ts` and `index.js` files are recognized as route handlers
  - Prevents accidental loading of utility files, helpers, types, etc.
  - Route files must be named exactly `index.ts` or `index.js`
  - Example: `routes/users.ts` ❌ → `routes/users/index.ts` ✅

#### spfn (CLI)

- **@/ Alias Support**: Next.js-style import paths now supported in server code
  - Templates now use `@/lib/contracts/` instead of relative paths
  - `src/server/tsconfig.json` configured with baseUrl and paths mapping
  - `src/server/tsup.config.ts` includes esbuild alias configuration
  - Automatic tsup dependency installation added to `spfn init`

- **spfn add Command**: One-command installation for SPFN ecosystem packages
  - Automatically installs package and applies pre-generated migrations
  - No file copying - migrations execute directly from node_modules
  - Displays package-specific setup guide after installation
  - Example: `pnpm spfn add @spfn/cms`

- **Function Package Migrations**: Pre-generated migrations bundled with npm packages
  - Migrations included in package distribution (`files: ["dist", "migrations"]`)
  - `spfn.migrations.dir` field in package.json specifies migration location
  - Automatic schema creation (e.g., `CREATE SCHEMA IF NOT EXISTS spfn_cms`)
  - `spfn db push` and `spfn db migrate` automatically apply function migrations

#### @spfn/cms

- **tsup Build System**: Migrated from custom build to tsup bundler
  - Automatic ES module bundling with proper dependency handling
  - `@/` alias support in source code
  - Smaller bundle size with tree-shaking
  - Removed `.js` extensions from imports (tsup handles automatically)

- **Pre-generated Migrations**: Database migrations now bundled with package
  - Migrations generated during build: `npm run db:generate`
  - Post-generate script adds `CREATE SCHEMA IF NOT EXISTS spfn_cms`
  - Migrations included in npm package distribution
  - No migration file copying required on installation

### Added

#### @spfn/core

- **@/ Alias Resolution**: Added built-in support for Next.js-style import paths
  - Configure via `baseUrl` and `paths` in tsconfig.json
  - Works with both development (tsx) and production (built files)
  - Example: `import { userContract } from '@/lib/contracts/users'`

#### spfn (CLI)

- **Template Updates**: All templates now use modern import patterns
  - Routes use `@/lib/contracts/` imports
  - No `.js` extensions in source code
  - Clean, Next.js-familiar developer experience
  - `tsconfig.json` and `tsup.config.ts` included in templates

#### @spfn/cms

- **Optimized Bundle**: Smaller package size with better performance
  - Production-ready ES modules
  - Proper tree-shaking support
  - No runtime bundling required

### Fixed

#### spfn (CLI)

- **Template Configuration**: Added missing tsup dependency to package.json
  - Prevents "tsup not found" errors in fresh projects
  - Automatic installation via `spfn init`

### Migration Guide (alpha.60)

<details>
<summary>Click to expand migration guide</summary>

#### 1. Move Contracts to Centralized Location

**Before (alpha.56):**
```
src/server/routes/
  users/
    contract.ts          # ❌ Co-located contract
    index.ts            # Route handler
```

**After (alpha.60):**
```
src/lib/contracts/
  users.ts              # ✅ Centralized contract

src/server/routes/
  users/
    index.ts            # Route handler (imports from @/lib/contracts/users)
```

#### 2. Update Contract Paths

**Before:**
```typescript
// Contract defined absolute path
export const getUsersContract = {
  method: 'GET',
  path: '/users',  // ✅ Already absolute
} as const satisfies RouteContract;
```

**After:** (Same - contracts already used absolute paths!)
```typescript
// No changes needed for contract paths
export const getUsersContract = {
  method: 'GET',
  path: '/users',  // ✅ Still absolute
} as const satisfies RouteContract;
```

#### 3. Update Route Imports to Use @/ Alias

**Before:**
```typescript
import { getUsersContract } from './contract.js';
// or
import { getUsersContract } from '../../../lib/contracts/users.js';
```

**After:**
```typescript
import { getUsersContract } from '@/lib/contracts/users';
```

#### 4. Rename Non-Index Route Files

**Before:**
```
routes/
  users.ts              # ❌ Not recognized
  teams.ts              # ❌ Not recognized
```

**After:**
```
routes/
  users/
    index.ts            # ✅ Recognized
  teams/
    index.ts            # ✅ Recognized
```

#### 5. Update tsconfig.json and Add tsup.config.ts

**Add to src/server/tsconfig.json:**
```json
{
  "compilerOptions": {
    "baseUrl": "../..",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**Add src/server/tsup.config.ts:**
```typescript
import { defineConfig } from 'tsup';
import path from 'path';

export default defineConfig({
    entry: {
        'routes/index': './routes/index.ts',
        'entities/index': './entities/index.ts',
    },
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: false,
    target: 'es2022',
    outDir: '../../.spfn/server',
    splitting: false,
    esbuildOptions(options) {
        options.alias = {
            '@': path.resolve(__dirname, '../../src'),
        };
    },
});
```

#### 6. Install tsup Dependency

```bash
pnpm add -D tsup
```

#### 7. Update Function Package Imports (if using @spfn/cms)

**Before:**
```bash
pnpm add @spfn/cms
pnpm spfn db push
```

**After:** (Simpler!)
```bash
pnpm spfn add @spfn/cms  # One command does everything!
```

</details>

---

## Version History

- [0.1.0-alpha.60] - 2025-10-29 - Contract-based architecture, @/ alias support, spfn add command
- For older versions, see [CHANGELOG-v0.0.x-alpha.md](./CHANGELOG-v0.0.x-alpha.md)