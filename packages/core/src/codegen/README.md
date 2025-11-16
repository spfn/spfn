# Code Generation

Automatic code generation system with pluggable generators and centralized file watching.

## Overview

SPFN's codegen system uses an **orchestrator pattern** that manages multiple code generators from a single watch process. This provides:

- ✅ **Unified file watching** - Single chokidar instance for all generators
- ✅ **Pluggable architecture** - Easy to add custom generators
- ✅ **Configuration-based** - Configure via `.spfnrc.json` or `package.json`
- ✅ **Build-time + watch mode** - Generate once or continuously during development
- ✅ **Error resilience** - One generator failure doesn't stop others
- ✅ **TypeScript support** - Load custom `.ts` generators at runtime (v0.1.0-alpha.21+)

## Built-in Generators

### Contract Generator

Automatically generates type-safe API clients from your route contracts.

**Input:** Contract files (default: `src/lib/contracts/**/*.ts`)
**Output:** Type-safe client library (default: `src/lib/api/`)

**Features:**
- Scans all contract files from your contracts directory
- **Multi-layer contract detection:**
  - Layer 1: `defineContract()` function (recommended)
  - Layer 2: `satisfies RouteContract` (legacy)
  - Layer 3: Name pattern + validation (fallback)
- Groups routes by resource
- Generates typed client methods with reusable type definitions
- Resource-based file splitting (always enabled)
- Includes JSDoc comments with usage examples
- **Incremental updates**: Detects contract signature changes and skips regeneration if only formatting changed

**Supported Contract Formats:**

```typescript
// ✅ Recommended: defineContract()
export const getUserContract = defineContract({
  method: 'GET',
  path: '/users/:id',
  // ...
});

// ✅ Legacy: satisfies RouteContract
export const getUserContract = {
  method: 'GET',
  path: '/users/:id',
  // ...
} satisfies RouteContract;

// ✅ Fallback: Name pattern (xxxContract)
export const getUserContract = {
  method: 'GET',
  path: '/users/:id',
  // ...
};
```

**Configuration:**

```json
{
  "codegen": {
    "generators": [
      {
        "name": "@spfn/core:contract",
        "enabled": true,
        "contractsDir": "src/lib/contracts",
        "outputPath": "src/lib/api",
        "baseUrl": "http://localhost:8790"
      }
    ]
  }
}
```

**Output Format:**

Split by Resource (always enabled):
```
src/lib/api/
  index.ts       # Unified exports + api object
  categories.ts  # Categories API + types
  companies.ts   # Companies API + types
  teams.ts       # Teams API + types
```

Benefits:
- ✅ Scalable: File size stays manageable
- ✅ Better organization: Related types and APIs together
- ✅ Tree-shaking friendly: Import only what you need
- ✅ Team-friendly: Parallel work on different resources

**Type Reuse:**

The generator creates reusable type definitions and references them in method signatures:

```typescript
// Type definitions (generated once)
export type GetCategoriesQuery = InferContract<typeof getCategoriesContract>['query'];

// Method signatures (reusing types)
list: (options: { query?: GetCategoriesQuery }) => client.call(...)
```

This eliminates repetitive `InferContract<typeof ...>` expressions and improves readability.

## Configuration

Configure codegen in `.spfnrc.json` or `package.json`:

### .spfnrc.json (Array-based format - since v0.1.0-alpha.21)

```json
{
  "codegen": {
    "generators": [
      {
        "name": "@spfn/core:contract",
        "enabled": true,
        "routesDir": "src/server/routes",
        "outputPath": "src/lib/api.ts",
        "baseUrl": "http://localhost:8790"
      },
      {
        "name": "@spfn/cms:label-sync",
        "enabled": true
      },
      {
        "path": "./src/generators/my-generator.ts"
      }
    ]
  }
}
```

**Package-based generators** use `package:name` format:
- `{ "name": "@spfn/core:contract", "enabled": true, ...config }`
- `{ "name": "@spfn/cms:label-sync", "enabled": true }`
- Automatically discovers generators from installed packages

**Custom generators** use `path` field:
- `{ "path": "./relative/path/to/generator.ts" }` - Relative to project root
- `{ "path": "/absolute/path/to/generator.js" }` - Absolute path
- TypeScript files (`.ts`) are loaded at runtime using jiti (no compilation needed)

### package.json

```json
{
  "spfn": {
    "codegen": {
      "generators": [
        { "name": "@spfn/core:contract", "enabled": true },
        { "name": "@spfn/cms:label-sync", "enabled": true },
        { "path": "./src/generators/my-generator.ts" }
      ]
    }
  }
}
```

### Initialize Configuration

Use the CLI to create a default `.spfnrc.json`:

```bash
spfn codegen init
```

## Usage

### CLI Commands (v0.1.0-alpha.21+)

```bash
# Initialize .spfnrc.json with default configuration
spfn codegen init

# List all registered generators with their watch patterns
spfn codegen list
# or
spfn codegen ls

# Run code generators once (no watch mode)
spfn codegen run

# Start dev server with automatic code generation
spfn dev
# The watcher will:
# 1. Generate all code once on startup
# 2. Watch for file changes
# 3. Regenerate automatically when files change
```

### Programmatic Usage

#### One-time Generation

```typescript
import { CodegenOrchestrator, loadCodegenConfig, createGeneratorsFromConfig } from '@spfn/core/codegen';

const cwd = process.cwd();
const config = loadCodegenConfig(cwd);
const generators = await createGeneratorsFromConfig(config, cwd); // async since v0.1.0-alpha.21

const orchestrator = new CodegenOrchestrator({
  generators,
  cwd,
  debug: true
});

// Generate once
await orchestrator.generateAll();
```

#### Watch Mode

```typescript
// Generate once, then watch for changes
await orchestrator.watch();
```

## Creating Custom Generators

### Option 1: File-based Registration (Recommended)

Create a generator file and register it via `.spfnrc.json`:

**Step 1:** Create generator file (TypeScript or JavaScript)

```typescript
// src/generators/admin-nav-generator.ts
import type { Generator, GeneratorOptions } from '@spfn/core/codegen';
import { writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

export default function createAdminNavGenerator(): Generator {
  return {
    name: 'admin-nav',

    // File patterns to watch (glob patterns)
    watchPatterns: ['src/app/admin/**/nav.config.tsx'],

    // When to run this generator (default: ['watch', 'manual', 'build'])
    runOn: ['watch', 'build'],  // Exclude 'manual' and 'start'

    // Generate code
    async generate(options: GeneratorOptions): Promise<void> {
      const { cwd, debug, trigger } = options;

      if (debug) {
        console.log('🔄 Generating admin navigation...');
        if (trigger?.changedFile) {
          console.log(`   Triggered by: ${trigger.changedFile.path} (${trigger.changedFile.event})`);
        }
      }

      // Your generation logic here
      // - Scan files
      // - Process data
      // - Write output files

      const outputPath = join(cwd, 'src/lib/admin/nav-data.generated.tsx');
      const navItems = await scanAndBuildNavItems(cwd);

      writeFileSync(outputPath, generateNavCode(navItems));

      if (debug) {
        console.log(`✅ Generated ${navItems.length} nav items`);
      }
    }
  };
}
```

**Step 2:** Register in `.spfnrc.json`

```json
{
  "codegen": {
    "generators": [
      {
        "path": "./src/generators/admin-nav-generator.ts"
      }
    ]
  }
}
```

**Step 3:** Use with CLI

```bash
# List generators (should show admin-nav)
spfn codegen list

# Run generators
spfn codegen run

# Or use in dev mode
spfn dev
```

### Option 2: Package-based Generators (v0.1.0-alpha.52+)

Create generators in npm packages that can be discovered automatically using the `package:name` format.

**Use case:** SPFN packages (like `@spfn/cms`) or third-party packages can provide generators that users can enable via configuration without needing file paths.

**Step 1:** Create generators registry in your package

```typescript
// packages/my-package/src/generators/index.ts
import { createMyGenerator } from './my-generator';
import { createAnotherGenerator } from './another-generator';

/**
 * Generators registry
 * Maps generator names to their factory functions
 */
export const generators = {
    'my-generator': createMyGenerator,
    'another': createAnotherGenerator,
};

// Re-export individual generators
export { createMyGenerator } from './my-generator';
export { createAnotherGenerator } from './another-generator';
```

**Step 2:** Export generators in package.json

```json
{
  "name": "my-package",
  "exports": {
    "./generators": {
      "types": "./dist/generators/index.d.ts",
      "import": "./dist/generators/index.js"
    }
  }
}
```

**Step 3:** Users can now reference your generators by package name

```json
{
  "codegen": {
    "generators": [
      {
        "name": "my-package:my-generator",
        "enabled": true
      },
      {
        "name": "@spfn/cms:label-sync",
        "enabled": true
      }
    ]
  }
}
```

**Discovery mechanism:**

The config loader tries to load generators in this order:
1. `import('my-package/generators')` → looks for `generators['my-generator']` registry
2. Fallback: `import('my-package/generators')` → looks for `createMyGeneratorGenerator()` function (conventional naming)
3. If not found, logs a warning with helpful error message

**Example:** SPFN CMS Label Sync Generator

```json
{
  "codegen": {
    "generators": [
      {
        "name": "@spfn/cms:label-sync",
        "enabled": true
      }
    ]
  }
}
```

This automatically loads the `label-sync` generator from `@spfn/cms/generators`.

### Option 3: Programmatic Registration

You can also register generators programmatically:

```typescript
import { CodegenOrchestrator, createContractGenerator } from '@spfn/core/codegen';
import { createAdminNavGenerator } from './generators/admin-nav-generator';

const orchestrator = new CodegenOrchestrator({
  generators: [
    createContractGenerator(),
    createAdminNavGenerator()
  ],
  cwd: process.cwd(),
  debug: true
});

await orchestrator.watch();
```

### Generator Interface

```typescript
import type { Generator, GeneratorOptions, GeneratorTrigger } from '@spfn/core/codegen';

export function createMyGenerator(config?: MyGeneratorConfig): Generator {
  return {
    name: 'my-generator',

    // File patterns to watch (glob patterns)
    watchPatterns: ['src/app/**/*.tsx'],

    // When to run this generator (default: ['watch', 'manual', 'build'])
    runOn: ['watch', 'manual', 'build'],  // Optional, exclude 'start' if not needed

    // Generate code
    async generate(options: GeneratorOptions): Promise<void> {
      const { cwd, debug, trigger } = options;

      // Check if triggered by file change
      if (trigger?.changedFile) {
        const { path, event } = trigger.changedFile;

        // Implement incremental update if possible
        if (canDoIncrementalUpdate(path, event)) {
          await incrementalUpdate(path);
          return;
        }
      }

      // Otherwise, do full regeneration
      // - Scan files
      // - Process data
      // - Write output files
    }
  };
}
```

### Example: Admin Navigation Generator

```typescript
import { writeFileSync, mkdirSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import type { Generator, GeneratorOptions } from '@spfn/core/codegen';

export interface AdminNavGeneratorConfig {
  adminDir?: string;
  outputPath?: string;
}

export function createAdminNavGenerator(config: AdminNavGeneratorConfig = {}): Generator {
  return {
    name: 'admin-nav',
    watchPatterns: [config.adminDir ?? 'src/app/admin/**/nav.config.tsx'],

    async generate(options: GeneratorOptions): Promise<void> {
      const cwd = options.cwd;
      const adminDir = config.adminDir ?? join(cwd, 'src', 'app', 'admin');
      const outputPath = config.outputPath ?? join(cwd, 'src', 'lib', 'admin', 'nav-data.generated.tsx');

      // 1. Scan admin directory for pages
      const pages = await scanAdminPages(adminDir);

      // 2. Generate navigation data
      const navData = generateNavData(pages);

      // 3. Write output file
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, navData, 'utf-8');
    }
  };
}
```

## API Reference

### `CodegenOrchestrator`

Central orchestrator that manages multiple code generators.

```typescript
class CodegenOrchestrator {
  constructor(options: OrchestratorOptions);

  // Generate all code once
  async generateAll(): Promise<void>;

  // Generate once, then watch for changes
  async watch(): Promise<void>;
}

interface OrchestratorOptions {
  generators: Generator[];
  cwd?: string;
  debug?: boolean;
}
```

### `Generator` Interface

Interface for code generators.

```typescript
/** Generator execution trigger types */
type GeneratorTrigger = 'watch' | 'manual' | 'build' | 'start';

interface Generator {
  /** Unique generator name */
  name: string;

  /** File patterns to watch (glob patterns) */
  watchPatterns: string[];

  /**
   * When this generator should run
   * @default ['watch', 'manual', 'build']
   *
   * - 'watch': During dev mode file watching
   * - 'manual': When explicitly run via CLI (`spfn codegen run`)
   * - 'build': During build process
   * - 'start': On server start
   */
  runOn?: GeneratorTrigger[];

  /**
   * Generate code
   *
   * Generator can implement incremental updates by checking `options.trigger.changedFile`.
   * If incremental update is not possible, do full regeneration.
   */
  generate(options: GeneratorOptions): Promise<void>;
}

interface GeneratorOptions {
  /** Project root directory */
  cwd: string;

  /** Enable debug logging */
  debug?: boolean;

  /** Execution trigger information */
  trigger?: {
    /** How the generator was triggered */
    type: GeneratorTrigger;

    /** Changed file information (only for 'watch' trigger) */
    changedFile?: {
      path: string;
      event: 'add' | 'change' | 'unlink';
    };
  };

  /** Custom configuration options */
  [key: string]: any;
}
```

### Configuration Loaders

```typescript
// Load configuration from .spfnrc.json or package.json
function loadCodegenConfig(cwd: string): CodegenConfig;

// Create generator instances from configuration
// async since v0.1.0-alpha.21 (for TypeScript generator loading)
async function createGeneratorsFromConfig(
  config: CodegenConfig,
  cwd: string  // required since v0.1.0-alpha.21
): Promise<Generator[]>;

interface CodegenConfig {
  generators?: Array<
    | { path: string }  // Custom generator via file path
    | ({ name: 'contract' } & ContractGeneratorConfig & { enabled?: boolean })
  >;
}
```

### Built-in Generators

```typescript
// Contract generator (API client generation)
function createContractGenerator(config?: ContractGeneratorConfig): Generator;

interface ContractGeneratorConfig {
  contractsDir?: string;    // Default: 'src/lib/contracts'
  outputPath?: string;      // Default: 'src/lib/api' (directory, not file)
  baseUrl?: string;         // Base URL for API client
}
```

## Error Handling

The orchestrator gracefully handles generator errors:

```typescript
// If one generator fails, others continue
await orchestrator.generateAll();
// ✅ Generator A: Success
// ❌ Generator B: Failed (logged)
// ✅ Generator C: Success
```

Failed generators log errors but don't stop the orchestration process.

## Performance

The orchestrator implements several optimizations:

1. **Debouncing**: Rapid file changes are debounced using `awaitWriteFinish`
2. **Concurrent prevention**: Uses `isGenerating` flag to prevent overlapping generation
3. **Pending queue**: Queues changes during generation for processing after completion
4. **Single watcher**: One chokidar instance watches all patterns

## Best Practices

### Generator Implementation

✅ **Do:**
- Make generation idempotent (same input = same output)
- Add proper error handling with try/catch
- Use descriptive generator names
- Log progress with debug flag
- Create output directories before writing files
- Export generator factory as default export for file-based loading

❌ **Don't:**
- Modify source files (only read)
- Throw errors without catching (breaks orchestrator)
- Watch overlapping patterns across generators
- Perform expensive operations synchronously

### Configuration

✅ **Do:**
- Use `.spfnrc.json` for project-specific config
- Use array-based format (since v0.1.0-alpha.21)
- Provide sensible defaults
- Document all configuration options
- Use relative paths from project root
- Use `spfn codegen init` to create initial config

❌ **Don't:**
- Hardcode absolute paths
- Assume directory structure
- Use production database in generators

## Integration with spfn dev

The `spfn dev` command automatically:

1. Loads configuration from `.spfnrc.json` or `package.json`
2. Creates generator instances based on config
3. Loads custom TypeScript generators using jiti (no compilation needed)
4. Starts orchestrator in watch mode
5. Runs alongside Next.js dev server

```typescript
// Generated watcher entry (node_modules/.spfn/watcher.mjs)
import { CodegenOrchestrator, loadCodegenConfig, createGeneratorsFromConfig } from '@spfn/core/codegen';

const cwd = process.cwd();
const config = loadCodegenConfig(cwd);
const generators = await createGeneratorsFromConfig(config, cwd); // async since v0.1.0-alpha.21

const orchestrator = new CodegenOrchestrator({
  generators,
  cwd,
  debug: true
});

await orchestrator.watch();
```

## Troubleshooting

### Generator not running

Check that:
1. Generator is enabled in config
2. Watch patterns match your files
3. No syntax errors in generator code
4. For custom generators: check file path in config
5. For TypeScript generators: ensure jiti can load the file

### Files not regenerating

Ensure:
1. Watch patterns include the changed files
2. No infinite loops (generator watching its own output)
3. `awaitWriteFinish` settings are appropriate

### TypeScript generator not loading

Check:
1. File path is correct (relative to project root)
2. Generator exports default factory function
3. No TypeScript compilation errors
4. jiti dependency is installed (`@spfn/core` includes it)

### Performance issues

Consider:
1. Making generators incremental (process only changed files)
2. Adjusting `awaitWriteFinish` thresholds
3. Using more specific watch patterns

## Migration Guide

### Upgrading to Latest Version

**Configuration format:**

Current format (array-based):
```json
{
  "codegen": {
    "generators": [
      { "name": "@spfn/core:contract", "enabled": true },
      { "path": "./src/generators/my-gen.ts" }
    ]
  }
}
```

**Generator naming:**

Use package:name format:
```json
// ✅ Correct
{ "name": "@spfn/core:contract", "enabled": true }

// ❌ Old format no longer supported
{ "name": "contract", "enabled": true }
```

**API usage:**

```typescript
import { createGeneratorsFromConfig } from '@spfn/core/codegen';
const generators = await createGeneratorsFromConfig(config, cwd);  // async + cwd required
```

## Testing

The codegen module has comprehensive test coverage across all components.

### Test Structure

```
codegen/__tests__/
├── client-generator.test.ts (370줄)     # 15 tests - 96.1% coverage
├── config-loader.test.ts (380줄)        # 15 tests - 70% coverage
├── contract-scanner.test.ts (369줄)     # 11 tests - 78.63% coverage
├── orchestrator.test.ts (120줄)         # 3 tests  - 20.89% coverage
└── route-scanner.test.ts (124줄)        # 3 tests  - 79.48% coverage
```

### Test Coverage Summary

| Module              | Tests | Coverage | Lines | Status |
|---------------------|-------|----------|-------|--------|
| client-generator.ts | 15    | 96.1%    | 426   | ✅ Excellent |
| config-loader.ts    | 15    | 70%      | 228   | ✅ Good |
| contract-scanner.ts | 11    | 78.63%   | 453   | ✅ Good |
| route-scanner.ts    | 3     | 79.48%   | 122   | ✅ Good |
| orchestrator.ts     | 3     | 20.89%   | 214   | ⚠️ Needs improvement |
| **Total**           | **47**| **43.82%**| **1869** | |

### Running Tests

```bash
# Run all codegen tests
pnpm vitest run src/codegen/__tests__

# Run with coverage
pnpm vitest run src/codegen/__tests__ --coverage

# Run specific test file
pnpm vitest run src/codegen/__tests__/client-generator.test.ts

# Watch mode
pnpm vitest watch src/codegen/__tests__
```

### What's Tested

#### client-generator.test.ts (15 tests, 96.1% coverage)

**Resource File Generation:**
- ✅ Generate complete resource file with types
- ✅ Generate multiple methods in resource
- ✅ Generate index file combining resources

**Method Name Generation:**
- ✅ Generate `list` for GET /
- ✅ Generate `getById` for GET /:id
- ✅ Generate `create` for POST /
- ✅ Generate `update` for PATCH /:id
- ✅ Generate `delete` for DELETE /:id

**Type Generation:**
- ✅ Response types for all routes
- ✅ Query types (when hasQuery)
- ✅ Params types (when hasParams or path contains :)
- ✅ Body types (when hasBody)

**Code Features:**
- ✅ JSDoc generation
- ✅ Contract imports grouping by path
- ✅ Method signature with options object
- ✅ Split client generation (resource-based files)

#### config-loader.test.ts (15 tests, 70% coverage)

**Configuration Loading:**
- ✅ Load from .spfnrc.json
- ✅ Load from package.json (fallback)
- ✅ Default configuration when no config found
- ✅ Handle invalid JSON gracefully
- ✅ Handle .spfnrc.json without codegen field
- ✅ Handle package.json without spfn.codegen field

**Generator Creation:**
- ✅ Return empty array for empty config
- ✅ Return empty array for config with no generators
- ✅ Skip disabled generators (`enabled: false`)
- ✅ Handle invalid generator name format
- ✅ Warn on invalid generator name (missing colon)
- ✅ Handle generator loading errors gracefully

**Edge Cases:**
- ✅ File read errors (permission denied)
- ✅ Multiple generator configurations
- ✅ Custom generator path errors
- ✅ Invalid custom generator (not a function)

#### contract-scanner.test.ts (11 tests, 78.63% coverage)

**Contract Detection (Multi-layer):**
- ✅ Extract contracts with `defineContract()` function (Layer 1 - Recommended)
- ✅ Extract contracts with `satisfies RouteContract` (Layer 2 - Legacy)
- ✅ Extract contracts with name pattern (Layer 3 - Fallback)
- ✅ Detect query property (hasQuery)
- ✅ Detect body property (hasBody)
- ✅ Detect params property (hasParams)
- ✅ Handle multiple contracts in single file

**Package Prefix:**
- ✅ Apply package prefix from package.json (`spfn.prefix`)
- ✅ Handle missing package prefix (empty string)

**Path Validation:**
- ✅ Require absolute paths (must start with /)
- ✅ Throw error for relative paths

**File Scanning:**
- ✅ Scan .ts, .js, .mjs files recursively
- ✅ Exclude .test.ts and .d.ts files

#### orchestrator.test.ts (3 tests, 20.89% coverage)

**Basic Functionality:**
- ✅ Run all generators once with `generateAll()`
- ✅ Handle generator errors without stopping others
- ✅ Pass options to generators (cwd, debug)

**⚠️ Coverage Gaps (needs improvement):**
- ❌ Watch mode not tested (requires integration test)
- ❌ File change handling not tested
- ❌ Concurrent regeneration queue not tested
- ❌ chokidar watcher integration not tested
- ❌ `onFileChange` handler not tested
- ❌ Pending regenerations queue not tested

#### route-scanner.test.ts (3 tests, 79.48% coverage)

**Route Scanning:**
- ✅ Scan routes directory recursively
- ✅ Group routes by resource name
- ✅ Extract route file paths correctly

### Test Quality Standards

All tests follow these principles:

1. **Mock External Dependencies**: File system operations, logger, etc.
2. **Test Edge Cases**: Invalid inputs, missing files, error conditions
3. **Verify Generated Code**: Check output format, types, imports
4. **Use Realistic Data**: Contract structures match actual usage
5. **Descriptive Test Names**: Clear what each test validates

### Example Test

```typescript
describe('client-generator', () => {
    it('should generate resource file with types', () => {
        const mappings: RouteContractMapping[] = [{
            method: 'GET',
            path: '/teams/:id',
            contractName: 'getTeamContract',
            contractImportPath: '@/lib/contracts/teams',
            routeFile: '',
            hasParams: true
        }];

        const code = generateResourceFile('teams', mappings, {
            routesDir: 'src/server/routes',
            outputPath: 'src/lib/api',
            includeTypes: true,
            includeJsDoc: true
        });

        // Verify types are generated
        expect(code).toContain('export type GetTeamResponse');
        expect(code).toContain('export type GetTeamParams');

        // Verify method signature
        expect(code).toContain('getById: (options: { params: GetTeamParams })');
    });
});
```

## See Also

- [Contract Generator](./contract-scanner.ts)
- [Route Scanner](./route-scanner.ts)
- [Client Generator](./client-generator.ts)