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

**Input:** Route files with contracts (e.g., `src/server/routes/**/*.ts`)
**Output:** Type-safe client library (e.g., `src/lib/api.ts`)

**Features:**
- Scans all route contracts from your routes directory
- Groups routes by resource
- Generates typed client methods
- Includes JSDoc comments with usage examples

**Configuration:**

```json
{
  "codegen": {
    "generators": [
      {
        "name": "contract",
        "enabled": true,
        "routesDir": "src/server/routes",
        "outputPath": "src/lib/api.ts",
        "baseUrl": "http://localhost:8790"
      }
    ]
  }
}
```

## Configuration

Configure codegen in `.spfnrc.json` or `package.json`:

### .spfnrc.json (Array-based format - since v0.1.0-alpha.21)

```json
{
  "codegen": {
    "generators": [
      {
        "name": "contract",
        "enabled": true,
        "routesDir": "src/server/routes",
        "outputPath": "src/lib/api.ts",
        "baseUrl": "http://localhost:8790"
      },
      {
        "path": "./src/generators/my-generator.ts"
      }
    ]
  }
}
```

**Built-in generators** use `name` field:
- `{ "name": "contract", "enabled": true, ...config }`

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
        { "name": "contract", "enabled": true },
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

    // Generate code
    async generate(options: GeneratorOptions): Promise<void> {
      const { cwd, debug } = options;

      if (debug) {
        console.log('🔄 Generating admin navigation...');
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
    },

    // Optional: Handle individual file changes
    async onFileChange(filePath: string, event: 'add' | 'change' | 'unlink') {
      console.log(`📝 Admin nav config ${event}: ${filePath}`);
      await this.generate({ cwd: process.cwd(), debug: false });
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

### Option 2: Programmatic Registration

You can also register generators programmatically:

```typescript
import { CodegenOrchestrator, createContractGenerator } from '@spfn/core/codegen';
import { createAdminNavGenerator } from './generators/admin-nav-generator.js';

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
import type { Generator, GeneratorOptions } from '@spfn/core/codegen';

export function createMyGenerator(config?: MyGeneratorConfig): Generator {
  return {
    name: 'my-generator',

    // File patterns to watch (glob patterns)
    watchPatterns: ['src/app/**/*.tsx'],

    // Generate code
    async generate(options: GeneratorOptions): Promise<void> {
      const { cwd, debug } = options;

      // Your generation logic here
      // - Scan files
      // - Process data
      // - Write output files
    },

    // Optional: Handle individual file changes
    async onFileChange(filePath: string, event: 'add' | 'change' | 'unlink') {
      // Custom logic for individual file changes
      // If not provided, orchestrator will call generate() on any change
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
interface Generator {
  /** Unique generator name */
  name: string;

  /** File patterns to watch (glob patterns) */
  watchPatterns: string[];

  /**
   * Generate code once
   */
  generate(options: GeneratorOptions): Promise<void>;

  /**
   * Handle individual file changes (optional)
   * If not provided, orchestrator will call generate() on any file change
   */
  onFileChange?(filePath: string, event: 'add' | 'change' | 'unlink'): Promise<void>;
}

interface GeneratorOptions {
  /** Project root directory */
  cwd: string;

  /** Enable debug logging */
  debug?: boolean;

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
  routesDir?: string;    // Default: 'src/server/routes'
  outputPath?: string;   // Default: 'src/lib/api.ts'
  baseUrl?: string;      // Default: 'http://localhost:8790'
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

### From v0.1.0-alpha.20 to v0.1.0-alpha.21

**Configuration format change:**

```typescript
// Before (alpha.20)
{
  "codegen": {
    "generators": {
      "contract": { "enabled": true }
    }
  }
}

// After (alpha.21+)
{
  "codegen": {
    "generators": [
      { "name": "contract", "enabled": true },
      { "path": "./src/generators/my-gen.ts" }  // NEW: Custom generators
    ]
  }
}
```

**API changes:**

```typescript
// Before (alpha.20)
import { createGeneratorsFromConfig } from '@spfn/core/codegen';
const generators = createGeneratorsFromConfig(config);  // sync

// After (alpha.21+)
import { createGeneratorsFromConfig } from '@spfn/core/codegen';
const generators = await createGeneratorsFromConfig(config, cwd);  // async + cwd required
```

## See Also

- [Contract Generator](./contract-scanner.ts)
- [Route Scanner](./route-scanner.ts)
- [Client Generator](./client-generator.ts)