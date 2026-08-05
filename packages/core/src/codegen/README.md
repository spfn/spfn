# @spfn/core/codegen — Code generation (route-map & custom generators)

Pluggable code-generation system with a single shared file watcher. The orchestrator
runs a list of generators once (build / manual) or continuously (watch). The one built-in
generator is `@spfn/core:route-map`, which produces the `routeName → {method, path}` map
the RPC proxy needs.

## Import paths

```typescript
// Single entry point — everything is exported from here:
import {
    defineConfig, defineGenerator,
    loadCodegenConfig, createGeneratorsFromConfig,
    CodegenOrchestrator,
} from '@spfn/core/codegen';

import type {
    CodegenConfig, GeneratorConfig,
    Generator, GeneratorOptions, GeneratorTrigger,
    OrchestratorOptions,
    RouteMapGeneratorConfig,
} from '@spfn/core/codegen';
```

There is no `@spfn/core/codegen/loader` or other sub-path — everything ships from
`@spfn/core/codegen`.

---

## Public API (complete)

Functions:

- `defineConfig(config: CodegenConfig): CodegenConfig` — identity helper for `.spfnrc.ts`.
- `defineGenerator<T>(config: T): T` — identity helper that carries a generator config's
  type through to the array (so `name`/options are type-checked).
- `loadCodegenConfig(cwd: string): CodegenConfig` — reads `.spfnrc.ts` → `.spfnrc.json` →
  `package.json` (first hit wins). Returns `{ generators: [] }` if none found.
- `createGeneratorsFromConfig(config, cwd): Promise<Generator[]>` — resolves each config
  entry into a live `Generator` (loads packages / `.ts` files via jiti).

Class:

- `CodegenOrchestrator` — `new CodegenOrchestrator(options)`, then `generateAll(trigger?)`,
  `watch()`, `close()`.

Types:

- `CodegenConfig`, `GeneratorConfig`
- `Generator`, `GeneratorOptions`, `GeneratorTrigger`
- `OrchestratorOptions`
- `RouteMapGeneratorConfig` (config shape for the built-in route-map generator)
- `RouteContractMapping`, `ResourceRoutes`, `ClientGenerationOptions`, `GenerationStats`
  (legacy client-generation types — exported but not used by any shipped generator)

> **Renamed: `defineCodegenConfig` → `defineConfig`.** The old name does **not** exist.
> Older docs also show an `api-client` / `createApi`-emitting generator and
> `codegen.config.ts` — those are **removed**. The only built-in generator today is
> `@spfn/core:route-map`, configured in `.spfnrc.ts`. Do not import `defineCodegenConfig`
> or configure a `name: 'api-client'` generator.

---

## Quick Start

### 1. Configure `.spfnrc.ts`

```typescript
import { defineConfig, defineGenerator } from '@spfn/core/codegen';

export default defineConfig({
    generators: [
        defineGenerator({
            name: '@spfn/core:route-map',
            routerPath: './src/server/router.ts',
            outputPath: './src/generated/route-map.ts', // optional (this is the default)
        }),
    ],
});
```

### 2. Generate

```bash
spfn codegen run      # run all generators once
spfn dev              # watch mode (regenerates on file change)
```

This writes `src/generated/route-map.ts`, which the RPC proxy imports.

---

## Configuration resolution

`loadCodegenConfig(cwd)` checks these in order and returns the **first** that exists:

1. `.spfnrc.ts` — loaded with jiti (supports `defineConfig`/`defineGenerator` + TS types).
   The default export (or the module itself) is the `CodegenConfig`.
2. `.spfnrc.json` — the config is read from the top-level **`codegen`** key:
   `{ "codegen": { "generators": [...] } }`.
3. `package.json` — read from **`spfn.codegen`**: `{ "spfn": { "codegen": { ... } } }`.

If none exist (or parsing fails), you get `{ generators: [] }` and nothing runs.

> Precedence is "first file found wins", not a deep merge. A `.spfnrc.ts` fully shadows
> `.spfnrc.json` and `package.json`.

### Generator config entries (`GeneratorConfig`)

A `generators[]` entry is one of three shapes:

| Shape | Example | Meaning |
|-------|---------|---------|
| Package generator | `{ name: 'pkg:gen', enabled?: true, ...opts }` | Loaded from `${pkg}/codegen`. `name` **must** contain `:`. `enabled: false` skips it. Extra keys are passed to the factory. |
| File generator | `{ path: './src/generators/x.ts' }` | A `.ts`/`.js` file whose default export is a `() => Generator` factory. `.ts` loaded via jiti. |
| Pre-built instance | `defineGenerator({...})` result that already has a `generate` fn | Pushed as-is (guards against accidentally calling a factory yourself). |

For package generators, `name` is split on `:` into `package:generatorName`. The loader
imports `${package}/codegen` and looks for `generators[generatorName]`, falling back to a
`create<Name>Generator` export. So `@spfn/core:route-map` → import `@spfn/core/codegen`,
call `generators['route-map'](config)`.

---

## Built-in: `@spfn/core:route-map`

Parses your router + route files and emits a `routeName → {method, path}` map. This map is
what the **RPC proxy** (`createRpcProxy` in `@spfn/core/nextjs/server`) uses to turn
`api.getUser.call(...)` into an HTTP request — it needs `method` and `path` without
importing server code into the client bundle.

### `RouteMapGeneratorConfig`

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | `'@spfn/core:route-map'` | yes | — | Generator identifier (literal). |
| `routerPath` | `string` | yes | — | Router file, relative to project root. Throws at construction if missing. |
| `outputPath` | `string` | no | `'./src/generated/route-map.ts'` | Where the map is written (parent dirs auto-created). |
| `additionalRouteDirs` | `string[]` | no | `[]` | Extra route dirs to watch (each becomes `${dir}/**/*.ts`). |

### What it parses

- **Router file** (`routerPath`): relative `import { ... } from './...'` statements, and the
  route names listed inside the **first** `defineRouter({ ... })` call (top-level
  identifiers, comments stripped).
- **Route files**: only the exact pattern
  `export const <name> = route.<get|post|put|patch|delete>('<path>')…` (single/double/back
  quotes). The leading `route.<method>('<path>')` call is what's matched.
- Only routes whose `name` also appears in `defineRouter({...})` end up in the output
  (declared-but-unregistered routes are dropped).

### Generated output

```typescript
// src/generated/route-map.ts  — DO NOT EDIT
import type { HttpMethod } from '@spfn/core/route';

export interface RouteInfo
{
    method: HttpMethod;
    path: string;
}

export const routeMap: Record<string, RouteInfo> = {
    getUser: { method: 'GET', path: '/users/:id' },
    createUser: { method: 'POST', path: '/users' },
};

export type RouteMap = typeof routeMap;
export type RouteName = keyof RouteMap;
```

`watchPatterns` are `[routerPath, 'src/server/routes/**/*.ts', ...additionalRouteDirs]` and
`runOn` is `['watch', 'manual']` — every trigger there is, so it runs in every mode.

---

## CLI

Provided by the `spfn` CLI (`@spfn/cli`), not by `@spfn/core` itself:

```bash
spfn codegen init     # scaffold a .spfnrc.ts
spfn codegen list     # list resolved generators + their watch patterns  (alias: ls)
spfn codegen run      # run all generators once (CodegenOrchestrator.generateAll, trigger 'manual')
spfn dev              # dev server + codegen in watch mode
spfn build            # runs codegen once before building
```

`spfn codegen run` has **no** `--name` flag — it always runs every configured generator.
(The `spfn init` project scaffold writes a `.spfnrc.ts` preconfigured with the route-map
generator and adds a `"codegen": "spfn codegen run"` npm script.)

---

## Programmatic usage

```typescript
import {
    CodegenOrchestrator,
    loadCodegenConfig,
    createGeneratorsFromConfig,
} from '@spfn/core/codegen';

const cwd = process.cwd();
const config = loadCodegenConfig(cwd);
const generators = await createGeneratorsFromConfig(config, cwd);

const orchestrator = new CodegenOrchestrator({ generators, cwd, debug: true });

// Run once. Trigger defaults to 'manual'; only generators whose runOn includes it execute.
await orchestrator.generateAll();            // 'manual'
await orchestrator.generateAll('watch');     // as the dev watcher does

// Watch mode: runs an initial 'watch' pass, then returns a promise that stays pending
// (keeping the process alive) until close() is called.
await orchestrator.watch();
// ...later, to shut down: await orchestrator.close();
```

### `OrchestratorOptions`

```typescript
interface OrchestratorOptions
{
    generators: Generator[];
    cwd?: string;       // default: process.cwd()
    debug?: boolean;    // default: false
}
```

---

## Custom generators

A generator is a plain object implementing the `Generator` interface. Register it by
`path` (file) or by exporting it from a package's `./codegen` entry.

### File-based

```typescript
// src/generators/admin-nav-generator.ts
import type { Generator, GeneratorOptions } from '@spfn/core/codegen';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// Default export MUST be a zero-arg factory returning a Generator.
export default function createAdminNavGenerator(): Generator
{
    return {
        name: 'admin-nav',
        watchPatterns: ['src/app/admin/**/nav.config.tsx'],
        runOn: ['watch', 'manual'],

        async generate(options: GeneratorOptions): Promise<void>
        {
            const out = join(options.cwd, 'src/lib/admin/nav-data.generated.tsx');
            mkdirSync(dirname(out), { recursive: true });
            // ...scan source, write `out`
        },
    };
}
```

```typescript
// .spfnrc.ts
import { defineConfig } from '@spfn/core/codegen';

export default defineConfig({
    generators: [
        { path: './src/generators/admin-nav-generator.ts' },
    ],
});
```

### Package-based

```typescript
// my-package/src/codegen/index.ts
import { createMyGenerator } from './my-generator';

// The loader looks up `generators[name]` by the part after the ':'.
export const generators = {
    'my-generator': createMyGenerator,   // factory: (config) => Generator
};
```

```jsonc
// my-package/package.json — must expose ./codegen
{ "exports": { "./codegen": { "import": "./dist/codegen/index.js", "types": "./dist/codegen/index.d.ts" } } }
```

```typescript
// consumer .spfnrc.ts
defineGenerator({ name: 'my-package:my-generator', enabled: true, /* ...opts */ });
```

The factory receives the config object with `name` and `enabled` stripped out (everything
else is passed through as options).

### `Generator` interface

```typescript
type GeneratorTrigger = 'watch' | 'manual';

interface Generator
{
    name: string;
    watchPatterns: string[];                 // globs; orchestrator watches their base dirs
    runOn?: GeneratorTrigger[];              // default ['watch', 'manual']
    generate(options: GeneratorOptions): Promise<void>;
}

interface GeneratorOptions
{
    cwd: string;
    debug?: boolean;
    trigger?: {
        type: GeneratorTrigger;
        changedFile?: { path: string; event: 'add' | 'change' | 'unlink' };  // watch only
    };
    [key: string]: any;
}
```

For incremental rebuilds, check `options.trigger?.changedFile` and fall back to full
regeneration when it's absent (build/manual passes don't set it).

---

## Pitfalls & anti-patterns

- **`defineCodegenConfig` does not exist — use `defineConfig`.** Likewise there is no
  `api-client` built-in generator, no `createApi`-emitting codegen, and no
  `codegen.config.ts`. The current model is `.spfnrc.ts` + `@spfn/core:route-map`. Any doc
  showing those is stale.
- **`.spfnrc.json` / `package.json` need the wrapper key.** JSON config lives under
  `"codegen"` (in `.spfnrc.json`) or `"spfn": { "codegen": ... }` (in `package.json`). A
  top-level `{ "generators": [...] }` in `.spfnrc.json` is ignored. (A `.spfnrc.ts` default
  export, by contrast, *is* the config directly.)
- **Config precedence is first-found, not merged.** A `.spfnrc.ts` completely shadows the
  JSON/package configs — they are not combined.
- **Run codegen before the client builds.** `src/generated/route-map.ts` is committed/built
  output the RPC proxy imports. If it's missing or stale, `api.<route>.call()` resolves the
  wrong (or no) `method`/`path`. `spfn build` runs codegen first; if you build by other
  means, run `spfn codegen run` yourself. Treat the file as generated (it's marked
  `DO NOT EDIT`).
- **route-map only matches a specific route syntax.** Routes must be
  `export const x = route.<method>('<literal path>')`. Dynamic paths, methods other than
  get/post/put/patch/delete, or routes not listed in `defineRouter({...})` won't appear.
- **A route must be in `defineRouter({...})` to be emitted.** Defining `export const foo =
  route.get(...)` but not registering `foo` in the router drops it from the map.
- **Custom generators must default-export a factory.** `createGeneratorsFromConfig` calls
  `module.default()` (a zero-arg function) for `{ path }` entries. Exporting the Generator
  object directly, or a factory that needs args, won't load.
- **Don't watch your own output.** A generator whose `watchPatterns` match its `outputPath`
  re-triggers itself. Write outputs outside the watched globs (the orchestrator serializes
  runs and queues one pending re-run, but a self-match still loops).
- **`generate()` should not throw to signal "skip".** The orchestrator catches errors per
  generator (one failure doesn't stop the others), but a throw is logged as a failure.
  Return early instead (route-map logs a warning and returns when the router file is
  absent).
- **`watch()` never resolves on its own.** It returns a promise that stays pending to keep
  the process alive; call `close()` to resolve it and tear down the chokidar watcher.
- **Package generators need a `:` in `name`.** `{ name: 'route-map' }` (no colon) is
  rejected as an invalid name — it must be `'@spfn/core:route-map'`.

---

## Complete example

```typescript
// .spfnrc.ts
import { defineConfig, defineGenerator } from '@spfn/core/codegen';

export default defineConfig({
    generators: [
        // Built-in: route-map for the RPC proxy
        defineGenerator({
            name: '@spfn/core:route-map',
            routerPath: './src/server/router.ts',
            outputPath: './src/generated/route-map.ts',
        }),
        // A project-local custom generator
        { path: './src/generators/admin-nav-generator.ts' },
    ],
});
```

```typescript
// src/server/router.ts
import { defineRouter } from '@spfn/core/route';
import { getUser, createUser } from './routes/users';

export const router = defineRouter({
    getUser,
    createUser,
});
```

```typescript
// src/server/routes/users.ts
import { route } from '@spfn/core/route';

export const getUser    = route.get('/users/:id')/* ...contract/handler */;
export const createUser = route.post('/users')/* ...contract/handler */;
```

```typescript
// app/api/rpc/[routeName]/route.ts — RPC proxy consumes the generated map
import { createRpcProxy } from '@spfn/core/nextjs/server';
import { routeMap } from '@/generated/route-map';

// routeMap (from src/generated/route-map.ts) lets the proxy resolve method + path
export const { GET, POST } = createRpcProxy({ routeMap });
```

```bash
spfn codegen run      # writes src/generated/route-map.ts
```

---

## Types reference

```typescript
interface CodegenConfig { generators?: GeneratorConfig[]; }

type GeneratorConfig =
    | { path: string }                                   // file-based
    | ({ name: string; enabled?: boolean } & Record<string, any>); // package-based

type GeneratorTrigger = 'watch' | 'manual';

interface Generator
{
    name: string;
    watchPatterns: string[];
    runOn?: GeneratorTrigger[];        // default ['watch', 'manual']
    generate(options: GeneratorOptions): Promise<void>;
}

interface RouteMapGeneratorConfig
{
    name: '@spfn/core:route-map';
    routerPath: string;
    outputPath?: string;               // default './src/generated/route-map.ts'
    additionalRouteDirs?: string[];
}
```

## Related

- [@spfn/core/route](../route/README.md) — `route.*` / `defineRouter` (the source parsed)
- [@spfn/core/nextjs](../nextjs/README.md) — RPC proxy (`createRpcProxy`) that consumes `routeMap`
- [@spfn/core/env](../env/README.md) — environment configuration
