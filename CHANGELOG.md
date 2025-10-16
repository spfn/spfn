# Changelog

All notable changes to SPFN will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
