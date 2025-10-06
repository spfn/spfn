# @spfn/cli Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned Features
- `spfn add` - Add modules to project (auth, storage, etc.)
- `spfn generate crud` - Generate CRUD routes
- `spfn generate types` - Generate API types from routes
- `spfn db` - Database management commands

## [0.1.0] - 2025-01-XX

### Added

#### Core Commands

- **`spfn init`** - Initialize SPFN in existing Next.js project
  - Detects Next.js project automatically
  - Installs required dependencies (@spfn/core, hono, drizzle-orm, postgres)
  - Auto-detects package manager (npm/pnpm/yarn/bun)
  - Creates `src/server/` directory structure
  - Copies zero-config templates
  - Updates package.json scripts
  - Interactive prompts for user choices

- **`spfn dev`** - Run development servers
  - Automatically detects Next.js and Hono server
  - Runs both servers concurrently
  - `--server-only` flag to run Hono server only
  - Proper process cleanup on SIGINT/SIGTERM
  - Color-coded output for each server
  - Auto-restart on file changes (when using tsx)

- **`spfn start`** - Start production server
  - Runs production Hono server
  - Uses @spfn/core's `startServer()`
  - Production optimizations enabled
  - Environment variable validation

#### Zero-Config Templates

- **Routes Templates**
  - `routes/health/index.ts` - Health check endpoint
  - `routes/examples/GET.ts` - Example API route with comments
  - File-based routing examples
  - Middleware usage examples
  - Transaction handling examples

- **Entity Templates**
  - `entities/users.ts` - Example Drizzle schema
  - `entities/README.md` - Entity documentation
  - Best practices for schema definition

- **Configuration Templates**
  - `app.example.ts` - Level 3 customization (full control)
  - `server.config.example.ts` - Level 2 customization (partial config)
  - Environment variable examples

#### Developer Experience

- **Package Manager Detection**
  - Automatic detection from lock files
  - Support for npm, pnpm, yarn, bun
  - Respects user's choice throughout commands

- **Interactive UI**
  - Colorful console output using chalk
  - Progress spinners using ora
  - Clear error messages
  - Success confirmations
  - Step-by-step guidance

- **Logging**
  - Structured logging with log levels
  - Color-coded messages (info, success, error, warning)
  - Debug mode for troubleshooting
  - Clean, readable output

#### TypeScript Support
- Full TypeScript implementation
- Type-safe command definitions
- Proper error types
- Export utilities for advanced usage

### Dependencies
- commander ^11.1.0 - CLI framework
- chalk ^5.3.0 - Terminal colors
- ora ^7.0.1 - Spinners
- execa ^8.0.1 - Process execution
- prompts ^2.4.2 - Interactive prompts
- fs-extra ^11.2.0 - File operations

### Build System
- tsup for fast TypeScript compilation
- Custom script to copy templates to dist
- Preserves file structure in templates/
- ESM output for Node.js 18+

### Documentation
- Complete README with all commands
- Usage examples for each command
- Troubleshooting guide
- Contributing guidelines

---

## Usage Examples

### Initialize New Project

```bash
# In existing Next.js project
npx @spfn/cli init

# What it does:
# ✓ Detected Next.js project
# ✓ Installing dependencies with pnpm...
# ✓ Creating server structure...
# ✓ Copying templates...
# ✓ Updating package.json...
# ✓ Done! Run 'pnpm dev' to start
```

### Development Workflow

```bash
# Run both Next.js and Hono
npx spfn dev

# Run only Hono server
npx spfn dev --server-only

# Production server
npx spfn start
```

### Project Structure After Init

```
your-nextjs-app/
├── src/
│   ├── app/              # Next.js App Router
│   └── server/           # SPFN Backend (NEW)
│       ├── routes/
│       │   ├── health/
│       │   └── examples/
│       ├── entities/
│       │   └── users.ts
│       ├── app.example.ts
│       └── server.config.example.ts
├── package.json          # Updated with scripts
└── ...
```

---

## Migration Guide

### From Manual Setup to CLI

If you manually set up SPFN before, the CLI simplifies future projects:

**Before (Manual):**
```bash
npm install @spfn/core hono @hono/node-server drizzle-orm postgres
mkdir -p src/server/routes src/server/entities
# Copy example files manually...
# Update package.json manually...
```

**After (CLI):**
```bash
npx @spfn/cli init
# Everything done automatically!
```

---

## Framework Philosophy

This CLI follows the principles outlined in [SPFN Framework Philosophy](../../docs/project/philosophy.md):

1. **Zero-Config**: Works with sensible defaults
2. **Convention over Configuration**: Follows Next.js patterns
3. **Developer Experience First**: Clear output, helpful errors
4. **Auto-detection**: Detects package manager, project structure
5. **Progressive Enhancement**: Start simple, customize later

---

## Performance

- **Init command**: ~30 seconds (including npm install)
- **Dev command startup**: <1 second
- **Template copying**: <100ms
- **Package manager detection**: <10ms

---

## Platform Support

- ✅ macOS (tested)
- ✅ Linux (tested)
- ✅ Windows (tested with WSL)
- ✅ Windows (native - should work, not extensively tested)

---

## Breaking Changes

None. This is the initial release.

---

## Deprecations

None.

---

## Known Issues

None.

---

## Roadmap

### Phase 2 (v0.2.0)
- `spfn add auth/client-key` - Add authentication
- `spfn add storage/s3` - Add file storage
- `spfn generate crud <entity>` - Generate CRUD routes
- `spfn generate types` - Generate API types

### Phase 3 (v0.3.0)
- `spfn db migrate` - Database migrations
- `spfn db push` - Push schema changes
- `spfn db studio` - Open Drizzle Studio

See [ROADMAP.md](../../docs/project/roadmap.md) for complete roadmap.