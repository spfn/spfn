# Changelog

All notable changes to SPFN will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note**: For changelog history prior to v0.1.0-alpha.60, see [CHANGELOG-v0.0.x-alpha.md](./CHANGELOG-v0.0.x-alpha.md)

## [0.1.0-alpha.79] - 2025-11-04

### Changed

#### @spfn/cms

- **Locale Naming Improvements**: Clarified naming distinction between project locales and system locales
  - Renamed `CmsConfig.supportedLocales` to `CmsConfig.locales` (kept deprecated `supportedLocales` for backward compatibility)
  - Added `getAllLocales()` function to get system-available locales (50+ supported languages)
  - Deprecated `getSupportedLocales()` in favor of `getAllLocales()`
  - Updated `configureCms()` to accept both `locales` and `supportedLocales` parameters with automatic synchronization
  - Updated all internal usages from `config.supportedLocales` to `config.locales`
  - **New naming convention**: `configureCms({ locales: ['en', 'ko'] })` for project-active locales, `getAllLocales()` for system-available locales

### Fixed

#### @spfn/cms

- **Label Type Sync Bug**: Fixed label type field not being preserved during sync operations
  - Fixed `flattenLabels()` in `helpers.ts` to include `type` field in flattened results
  - Fixed `syncSection()` in `sync.ts` to update `type` field in database
  - Fixed change detection to recognize type changes (e.g., text → image)
  - Label types (text, image, video, file, object) now correctly synced from JSON to database

## [0.1.0-alpha.78] - 2025-11-03

### Fixed

#### @spfn/cms

- **Translation Function Object Support**: Fixed `t()` function to handle object-type label values
  - Added automatic `content` field extraction from object values (e.g., `{ type: "text", content: "..." }`)
  - Applied to both `getSection()` and `getSections()` functions
  - Now correctly renders labels that have structured object values instead of plain strings
  - Enables CMS to support rich label metadata while maintaining simple `t()` API

## [0.1.0-alpha.77] - 2025-11-03

### Fixed

#### @spfn/cms

- **Label Version History API**: Fixed to query from `cms_label_values` table directly
  - Changed from `cms_label_versions` (unused table) to `cms_label_values`
  - Queries published versions where `version IS NOT NULL`
  - Returns version history with values grouped by version number
  - Note: `publishedBy` and `notes` fields are null (not stored in label_values table)

## [0.1.0-alpha.76] - 2025-11-03

### Added

#### @spfn/cms

- **Label Version History API**: Added new API endpoint to fetch complete version history for labels
  - New contract: `getLabelVersionsContract` (GET /_cms/labels/:labelId/versions)
  - New route handler: `/labels/[labelId]/versions/index.ts` with DB query optimization
  - Auto-generated API client function: `getLabelVersions()`
  - Returns all published versions with metadata (publishedAt, publishedBy, notes) and values
  - Optimized single API call replaces multiple sequential calls for better performance
  - Version history sorted by version number (descending - newest first)

## [0.1.0-alpha.75] - 2025-11-03

### Added

#### @spfn/cms

- **Label Description Field**: Added `description` field support throughout CMS system
  - Added `description` column to `cms_labels` entity (nullable text field)
  - Updated all API contracts to include `description` field in responses
  - Updated all route handlers to return `description` field
  - Admin UI now displays label descriptions in label list and editor header
  - Descriptions shown below label keys for better context and usability

### Fixed

#### @spfn/cms

- Fixed TypeScript build errors related to missing `description` field in API responses
- Ensured consistent `description` field presence across all label-related endpoints

## [0.1.0-alpha.74] - 2025-11-03

### Added

#### @spfn/cms

- **Draft & Publish System (Phase 1)**: Implemented complete publish workflow for CMS labels
  - New contracts: `publishLabelContract` (POST /_cms/labels/:labelId/publish), `getAdminLabelContract` (GET /_cms/labels/:labelId/admin)
  - New helper functions: `publishLabel()` - converts Draft (version=null) to Published (version=number), `updatePublishedCache()` - regenerates cache for all locales
  - New API endpoints with full error handling and validation
  - Repository extension: `findDraftsByLabelId()` for querying draft values
  - Auto-generated API client functions: `publishLabel()`, `getAdminLabel()`
  - Status calculation: 'default-only', 'unpublished', 'published', 'modified'
  - Published cache regeneration with defaultValue fallback support

#### @spfn/core

- **Contract Scanner Logging**: Added debug logging to contract scanner for troubleshooting
  - New logger: `scannerLogger` with detailed contract extraction logs
  - Logs: contract file discovery, extraction progress, final mapping count
  - Helps diagnose codegen issues and contract detection problems

## [0.1.0-alpha.73] - 2025-11-03

### Fixed

#### @spfn/cms

- **ESM Import Compatibility**: Fixed missing `.js` extension in `next/headers` import in `locale.actions.ts`
  - Changed `import { cookies, headers } from 'next/headers'` to `import { cookies, headers } from 'next/headers.js'`
  - Ensures proper ESM module resolution in production builds

## [0.1.0-alpha.72] - 2025-11-03

### Added

#### @spfn/auth

- **Custom Error Classes**: Added comprehensive error handling system in `server/errors/auth-errors.ts`
  - New errors: `InvalidCredentials`, `AccountDisabled`, `AccountAlreadyExists`, `InvalidVerificationCode`, `InvalidToken`, `TokenExpired`, `KeyExpired`, etc.
  - Migrated from manual JSON responses to throwing typed errors

- **Email/SMS Verification System**: Implemented complete verification code flow
  - Added `verification_codes` entity and helper functions
  - New endpoints: `POST /_auth/codes` (send code), `POST /_auth/codes/verify` (verify code)
  - Verification tokens with 15-minute validity for registration flow
  - Support for registration, password reset, and email/phone change purposes

- **Auth Context Helpers**: Created type-safe context access system
  - New `AuthContext` interface grouping user, userId, keyId
  - Extended Hono's `ContextVariableMap` for type-safe context
  - Helper functions: `getAuth()`, `getUser()`, `getUserId()`, `getKeyId()`
  - Updated all routes to use type-safe helpers

- **Generated API Client**: Auto-generated type-safe client functions in `lib/api/`
  - Functions: `authExists()`, `authLogin()`, `authRegister()`, `authCodesVerify()`, etc.
  - Automatic contract-to-function conversion with proper naming

- **Integration Tests**: Added comprehensive test coverage
  - New integration tests for authenticate middleware (390 lines)
  - New unit tests for verification system (250 lines)

#### @spfn/cms

- **Draft System**: Implemented draft/published version system
  - `version: null` for drafts (mutable)
  - `version: number` for published versions (immutable)
  - Database migration 0002: Made version column nullable
  - Drafts can be overwritten, published versions are immutable

#### @spfn/core

- **Enhanced Error Handling**: Added new HTTP error classes
  - Better error serialization and HTTP status mapping
  - Integration with auth error system

- **API Response Helpers**: Added `c.success()` and `c.error()` helpers to RouteContext
  - Simplified error handling in route handlers
  - Better integration with error throwing pattern

- **Route Binding**: New `bind.ts` module with route binding utilities

### Changed

#### @spfn/auth

- **Registration Flow**: Now requires verification token from code verification
  - New flow: send code → verify code → register with token
  - Enhanced security with verification step

- **Authentication Middleware**: Refactored to use error throwing instead of response objects
  - Better separation of concerns
  - Improved error messages and types
  - Fire-and-forget `lastUsedAt` updates

- **API Response Format**: Simplified response types (removed wrapper objects)
  - Direct data returns instead of nested `data` wrapper for success responses

#### @spfn/cms

- **Entity Schema**: `cms_label_values.version` is now nullable
- **Contract**: `saveValuesContract` accepts `version: null | number`
- **Repository**: `upsert()` handles null version with draft/publish logic
- **Store**: Fixed API call from `cmsPublishedCache.get()` to `getPublishedCache()`

#### @spfn/core

- **API Response Module**: Simplified `route/api-response.ts` (210 lines removed)
- **Code Generator**: Improved contract-to-client generation in `codegen/built-in/contract/emitter.ts`
  - Better function naming (e.g., POST /api/auth/login → `authLogin()`)
  - Improved type generation for API clients

### Breaking Changes

#### @spfn/auth

- Registration endpoint now requires `verificationToken` parameter
- API response format changed (no more nested `data` wrapper for success)
- Auth context access changed from `c.raw.get('user')` to `getUser(c)`

## [0.1.0-alpha.69] - 2025-11-02

### Added

#### @spfn/cms

- **Labels API - Default Values Support**: Added `includeDefaultValues` query parameter to `GET /_cms/labels`
  - Returns `defaultValue` field from label definition JSON files
  - Enables admin UIs to show default values when no content is saved
  - Automatically loads and merges default values from `src/cms/labels/{section}/*.json`

- **Published Cache Upsert Endpoint**: Added `POST /_cms/published-cache` endpoint
  - Create or update published content cache
  - Request body: `{ section, locale, content, version }`
  - Returns updated cache with `publishedAt` timestamp
  - Enables programmatic cache updates after publishing labels

### Changed

#### @spfn/cms

- **Labels Contract**: Updated `getLabelsContract` response schema to include optional `defaultValue` field

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