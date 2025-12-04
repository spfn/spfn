# @spfn/core/codegen - Code Generation

Automatic code generation system with pluggable generators and centralized file watching.

## Core Components

```
codegen/
├── index.ts                    # Module exports
├── core/
│   ├── orchestrator.ts         # Central orchestrator
│   ├── config-loader.ts        # Configuration loading
│   ├── generator.ts            # Generator interface
│   └── types.ts                # Type definitions
├── generators/
│   └── index.ts                # Generators registry
└── __tests__/
    ├── helpers.test.ts
    ├── client-generator.test.ts
    ├── orchestrator.test.ts
    └── orchestrator-custom-generator.test.ts
```

## Features

- **Unified file watching**: Single chokidar instance for all generators
- **Pluggable architecture**: Easy to add custom generators
- **Configuration-based**: Configure via `.spfnrc.ts`, `.spfnrc.json` or `package.json`
- **Build-time + watch mode**: Generate once or continuously during development
- **Error resilience**: One generator failure doesn't stop others
- **TypeScript support**: Load custom `.ts` generators at runtime

---

## Configuration

Configure codegen in `.spfnrc.ts`, `.spfnrc.json`, or `package.json` (priority order).

### .spfnrc.ts (Recommended)

```typescript
import { defineConfig, defineGenerator } from '@spfn/core/codegen';
import type { MyGeneratorConfig } from 'my-package';

const customGen = defineGenerator<MyGeneratorConfig>({
  name: 'my-package:generator',
  myOption: 'value',
});

export default defineConfig({
  generators: [customGen]
});
```

### .spfnrc.json

```json
{
  "codegen": {
    "generators": [
      {
        "name": "my-package:generator",
        "enabled": true,
        "myOption": "value"
      },
      {
        "path": "./src/generators/my-generator.ts"
      }
    ]
  }
}
```

### package.json

```json
{
  "spfn": {
    "codegen": {
      "generators": [
        { "name": "my-package:generator", "enabled": true },
        { "path": "./src/generators/my-generator.ts" }
      ]
    }
  }
}
```

### Generator Types

**Package-based generators** use `package:name` format:
- `{ "name": "my-package:generator", "enabled": true, ...config }`
- Automatically discovers generators from `${packageName}/codegen`

**Custom generators** use `path` field:
- `{ "path": "./relative/path/to/generator.ts" }` - Relative to project root
- TypeScript files are loaded at runtime using jiti

---

## Usage

### CLI Commands

```bash
# Initialize .spfnrc.json with default configuration
spfn codegen init

# List all registered generators with their watch patterns
spfn codegen list

# Run code generators once (no watch mode)
spfn codegen run

# Start dev server with automatic code generation
spfn dev
```

### Programmatic Usage

```typescript
import {
  CodegenOrchestrator,
  loadCodegenConfig,
  createGeneratorsFromConfig
} from '@spfn/core/codegen';

const cwd = process.cwd();
const config = loadCodegenConfig(cwd);
const generators = await createGeneratorsFromConfig(config, cwd);

const orchestrator = new CodegenOrchestrator({
  generators,
  cwd,
  debug: true
});

// Generate once
await orchestrator.generateAll();

// Or watch mode
await orchestrator.watch();
```

---

## Creating Custom Generators

### File-based Registration

**Step 1:** Create generator file

```typescript
// src/generators/admin-nav-generator.ts
import type { Generator, GeneratorOptions } from '@spfn/core/codegen';
import { writeFileSync } from 'fs';
import { join } from 'path';

export default function createAdminNavGenerator(): Generator {
  return {
    name: 'admin-nav',
    watchPatterns: ['src/app/admin/**/nav.config.tsx'],
    runOn: ['watch', 'build'],

    async generate(options: GeneratorOptions): Promise<void> {
      const { cwd, debug, trigger } = options;

      if (debug) {
        console.log('Generating admin navigation...');
      }

      // Your generation logic here
      const outputPath = join(cwd, 'src/lib/admin/nav-data.generated.tsx');
      // ... scan files, process data, write output
    }
  };
}
```

**Step 2:** Register in `.spfnrc.json`

```json
{
  "codegen": {
    "generators": [
      { "path": "./src/generators/admin-nav-generator.ts" }
    ]
  }
}
```

### Package-based Generators

Create generators in npm packages that can be discovered automatically.

**Step 1:** Create generators registry

```typescript
// packages/my-package/src/codegen/index.ts
import { createMyGenerator } from './my-generator';

export const generators = {
  'my-generator': createMyGenerator,
};

export { createMyGenerator } from './my-generator';
```

**Step 2:** Export in package.json

```json
{
  "name": "my-package",
  "exports": {
    "./codegen": {
      "types": "./dist/codegen/index.d.ts",
      "import": "./dist/codegen/index.js"
    }
  }
}
```

**Step 3:** Users reference by package name

```json
{
  "codegen": {
    "generators": [
      { "name": "my-package:my-generator", "enabled": true }
    ]
  }
}
```

---

## API Reference

### Exports

```typescript
// Core
export { CodegenOrchestrator } from './core/orchestrator';
export {
  loadCodegenConfig,
  createGeneratorsFromConfig,
  defineConfig,
  defineGenerator
} from './core/config-loader';

// Types
export type { Generator, GeneratorOptions, GeneratorTrigger } from './core/generator';
export type { OrchestratorOptions } from './core/orchestrator';
export type { CodegenConfig, GeneratorConfig } from './core/config-loader';
export type {
  RouteContractMapping,
  ResourceRoutes,
  ClientGenerationOptions,
  GenerationStats
} from './core/types';
```

### `CodegenOrchestrator`

```typescript
class CodegenOrchestrator {
  constructor(options: OrchestratorOptions);
  async generateAll(): Promise<void>;
  async watch(): Promise<void>;
}

interface OrchestratorOptions {
  generators: Generator[];
  cwd?: string;
  debug?: boolean;
}
```

### `Generator` Interface

```typescript
type GeneratorTrigger = 'watch' | 'manual' | 'build' | 'start';

interface Generator {
  name: string;
  watchPatterns: string[];
  runOn?: GeneratorTrigger[];  // Default: ['watch', 'manual', 'build']
  generate(options: GeneratorOptions): Promise<void>;
}

interface GeneratorOptions {
  cwd: string;
  debug?: boolean;
  trigger?: {
    type: GeneratorTrigger;
    changedFile?: {
      path: string;
      event: 'add' | 'change' | 'unlink';
    };
  };
  [key: string]: any;
}
```

### `defineConfig` and `defineGenerator`

Type-safe helper functions for configuration:

```typescript
import { defineConfig, defineGenerator } from '@spfn/core/codegen';
import type { MyGeneratorConfig } from 'my-package';

const customGen = defineGenerator<MyGeneratorConfig>({
  name: 'my-package:generator',
  myOption: 'value',  // Type-safe!
});

export default defineConfig({
  generators: [customGen]
});
```

---

## Best Practices

### Generator Implementation

**Do:**
- Make generation idempotent (same input = same output)
- Add proper error handling with try/catch
- Use descriptive generator names
- Log progress with debug flag
- Create output directories before writing files
- Export generator factory as default export

**Don't:**
- Modify source files (only read)
- Throw errors without catching (breaks orchestrator)
- Watch overlapping patterns across generators
- Perform expensive operations synchronously

### Configuration

**Do:**
- Use `.spfnrc.ts` for type-safe configuration
- Use `defineGenerator()` for type inference
- Provide sensible defaults
- Use relative paths from project root

**Don't:**
- Hardcode absolute paths
- Assume directory structure
- Use production database in generators

---

## Test Coverage

The codegen module has tests across all components:

| File | Description |
|------|-------------|
| helpers.test.ts | Helper utilities |
| client-generator.test.ts | Client code generation |
| orchestrator.test.ts | Orchestrator functionality |
| orchestrator-custom-generator.test.ts | Custom generator loading |

### Running Tests

```bash
# Run all codegen tests
pnpm vitest run src/codegen/__tests__

# Run with coverage
pnpm vitest run src/codegen/__tests__ --coverage

# Run specific test file
pnpm vitest run src/codegen/__tests__/orchestrator.test.ts
```

---

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
4. jiti dependency is installed

---

## Related

- [@spfn/core/route](../route/README.md) - Route definition
- [@spfn/core/nextjs](../nextjs/README.md) - Next.js client