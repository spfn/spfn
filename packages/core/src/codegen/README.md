# Code Generation

Automatic code generation system with pluggable generators and centralized file watching.

## Overview

SPFN's codegen system uses an **orchestrator pattern** that manages multiple code generators from a single watch process. This provides:

- ✅ **Unified file watching** - Single chokidar instance for all generators
- ✅ **Pluggable architecture** - Easy to add custom generators
- ✅ **Configuration-based** - Configure via `.spfnrc.json` or `package.json`
- ✅ **Build-time + watch mode** - Generate once or continuously during development
- ✅ **Error resilience** - One generator failure doesn't stop others

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

\`\`\`json
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
\`\`\`

## Configuration

Configure codegen in `.spfnrc.json` or `package.json`:

### .spfnrc.json

\`\`\`json
{
  "codegen": {
    "generators": {
      "contract": {
        "enabled": true,
        "routesDir": "src/server/routes",
        "outputPath": "src/lib/api.ts"
      }
    }
  }
}
\`\`\`

### package.json

\`\`\`json
{
  "spfn": {
    "codegen": {
      "generators": {
        "contract": {
          "enabled": true
        }
      }
    }
  }
}
\`\`\`

## Usage

### CLI Commands

The codegen system is integrated into `spfn dev`:

\`\`\`bash
# Start dev server with automatic code generation
spfn dev

# The watcher will:
# 1. Generate all code once on startup
# 2. Watch for file changes
# 3. Regenerate automatically when files change
\`\`\`

### Programmatic Usage

#### One-time Generation

\`\`\`typescript
import { CodegenOrchestrator, loadCodegenConfig, createGeneratorsFromConfig } from '@spfn/core/codegen';

const cwd = process.cwd();
const config = loadCodegenConfig(cwd);
const generators = createGeneratorsFromConfig(config);

const orchestrator = new CodegenOrchestrator({
  generators,
  cwd,
  debug: true
});

// Generate once
await orchestrator.generateAll();
\`\`\`

#### Watch Mode

\`\`\`typescript
// Generate once, then watch for changes
await orchestrator.watch();
\`\`\`

## Creating Custom Generators

You can create custom generators by implementing the `Generator` interface:

\`\`\`typescript
import type { Generator, GeneratorOptions } from '@spfn/core/codegen';

export function createMyGenerator(config?: MyGeneratorConfig): Generator
{
  return {
    name: 'my-generator',

    // File patterns to watch (glob patterns)
    watchPatterns: ['src/app/**/*.tsx'],

    // Generate code
    async generate(options: GeneratorOptions): Promise<void>
    {
      const { cwd, debug } = options;

      // Your generation logic here
      // - Scan files
      // - Process data
      // - Write output files
    },

    // Optional: Handle individual file changes
    async onFileChange(filePath: string, event: 'add' | 'change' | 'unlink')
    {
      // Custom logic for individual file changes
      // If not provided, orchestrator will call generate() on any change
    }
  };
}
\`\`\`

### Example: Admin Navigation Generator

\`\`\`typescript
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import type { Generator, GeneratorOptions } from '@spfn/core/codegen';

export interface AdminNavGeneratorConfig
{
  adminDir?: string;
  outputPath?: string;
}

export function createAdminNavGenerator(config: AdminNavGeneratorConfig = {}): Generator
{
  return {
    name: 'admin-nav',
    watchPatterns: [config.adminDir ?? 'src/app/admin/**/*'],

    async generate(options: GeneratorOptions): Promise<void>
    {
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

// Register with orchestrator
const orchestrator = new CodegenOrchestrator({
  generators: [
    createContractGenerator(),
    createAdminNavGenerator({
      adminDir: 'src/app/admin',
      outputPath: 'src/lib/admin/nav-data.generated.tsx'
    })
  ],
  cwd: process.cwd(),
  debug: true
});
\`\`\`

## API Reference

### \`CodegenOrchestrator\`

Central orchestrator that manages multiple code generators.

\`\`\`typescript
class CodegenOrchestrator
{
  constructor(options: OrchestratorOptions);

  // Generate all code once
  async generateAll(): Promise<void>;

  // Generate once, then watch for changes
  async watch(): Promise<void>;
}

interface OrchestratorOptions
{
  generators: Generator[];
  cwd?: string;
  debug?: boolean;
}
\`\`\`

### \`Generator\` Interface

Interface for code generators.

\`\`\`typescript
interface Generator
{
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

interface GeneratorOptions
{
  /** Project root directory */
  cwd: string;

  /** Enable debug logging */
  debug?: boolean;

  /** Custom configuration options */
  [key: string]: any;
}
\`\`\`

### Configuration Loaders

\`\`\`typescript
// Load configuration from .spfnrc.json or package.json
function loadCodegenConfig(cwd: string): CodegenConfig;

// Create generator instances from configuration
function createGeneratorsFromConfig(config: CodegenConfig): Generator[];
\`\`\`

### Built-in Generators

\`\`\`typescript
// Contract generator (API client generation)
function createContractGenerator(config?: ContractGeneratorConfig): Generator;

interface ContractGeneratorConfig
{
  routesDir?: string;    // Default: 'src/server/routes'
  outputPath?: string;   // Default: 'src/lib/api.ts'
  baseUrl?: string;      // Default: 'http://localhost:8790'
}
\`\`\`

## Error Handling

The orchestrator gracefully handles generator errors:

\`\`\`typescript
// If one generator fails, others continue
await orchestrator.generateAll();
// ✅ Generator A: Success
// ❌ Generator B: Failed (logged)
// ✅ Generator C: Success
\`\`\`

Failed generators log errors but don't stop the orchestration process.

## Performance

The orchestrator implements several optimizations:

1. **Debouncing**: Rapid file changes are debounced using \`awaitWriteFinish\`
2. **Concurrent prevention**: Uses \`isGenerating\` flag to prevent overlapping generation
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

❌ **Don't:**
- Modify source files (only read)
- Throw errors without catching (breaks orchestrator)
- Watch overlapping patterns across generators
- Perform expensive operations synchronously

### Configuration

✅ **Do:**
- Use \`.spfnrc.json\` for project-specific config
- Provide sensible defaults
- Document all configuration options
- Use relative paths from project root

❌ **Don't:**
- Hardcode absolute paths
- Assume directory structure
- Use production database in generators

## Integration with spfn dev

The \`spfn dev\` command automatically:

1. Loads configuration from \`.spfnrc.json\` or \`package.json\`
2. Creates generator instances based on config
3. Starts orchestrator in watch mode
4. Runs alongside Next.js dev server

\`\`\`typescript
// Generated watcher entry (node_modules/.spfn/watcher.mjs)
import { CodegenOrchestrator, loadCodegenConfig, createGeneratorsFromConfig } from '@spfn/core/codegen';

const cwd = process.cwd();
const config = loadCodegenConfig(cwd);
const generators = createGeneratorsFromConfig(config);

const orchestrator = new CodegenOrchestrator({
  generators,
  cwd,
  debug: true
});

await orchestrator.watch();
\`\`\`

## Troubleshooting

### Generator not running

Check that:
1. Generator is enabled in config
2. Watch patterns match your files
3. No syntax errors in generator code

### Files not regenerating

Ensure:
1. Watch patterns include the changed files
2. No infinite loops (generator watching its own output)
3. \`awaitWriteFinish\` settings are appropriate

### Performance issues

Consider:
1. Making generators incremental (process only changed files)
2. Adjusting \`awaitWriteFinish\` thresholds
3. Using more specific watch patterns

## See Also

- [Contract Generator](./contract-scanner.ts)
- [Route Scanner](./route-scanner.ts)
- [Client Generator](./client-generator.ts)
