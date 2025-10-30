# Changelog

All notable changes to SPFN will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note**: For changelog history prior to v0.1.0-alpha.60, see [CHANGELOG-v0.0.x-alpha.md](./CHANGELOG-v0.0.x-alpha.md)

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