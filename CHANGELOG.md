# Changelog

All notable changes to SPFN will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
