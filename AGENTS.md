# AGENTS.md

Machine-readable guide for AI coding agents (Claude Code, Cursor, Codex, …) working
in this repository. Humans should read [CONTRIBUTING.md](./CONTRIBUTING.md) first;
this file is the contract an agent is expected to follow.

> This is the canonical agent instruction file. Tool-specific files
> (`CLAUDE.md`, `.cursorrules`, …) only point here — do not duplicate rules.

## What this repo is

SPFN (Superfunction) is a TypeScript framework for building full-stack apps with a
Next.js frontend and a typed SPFN backend, published as a set of `@spfn/*` packages.
It is a **pnpm + Turborepo monorepo**.

```
packages/   published framework packages (@spfn/core, @spfn/auth, … and the `spfn` CLI)
examples/   runnable example apps (also pnpm workspace members)
docs/       prose documentation
apps/        LOCAL-ONLY scratch apps — gitignored, never part of a PR
```

Deep, authoritative documentation for each package lives in its own
`packages/<name>/README.md` — these are maintained as the AI-facing source of truth.
**Read the relevant package README before changing that package.** Do not restate
their contents here.

## Setup & commands

Requires Node ≥ 18.18 and pnpm (see `packageManager` in `package.json`). From the repo root:

```bash
pnpm install            # install all workspace deps
pnpm build              # build every package (turbo; runs a circular-dep check first)
pnpm test               # run all tests (vitest)
pnpm lint               # eslint — house style (Allman, 4-space, semicolons)
pnpm lint:fix           # auto-fix style violations
```

Per package (run inside `packages/<name>/`):

```bash
pnpm build              # tsup build (+ madge circular check)
pnpm type-check         # tsc --noEmit
pnpm test               # vitest run
pnpm test:unit          # unit tests only (where present)
pnpm check:circular     # madge --circular
```

Integration tests need a database. Start the throwaway containers first:

```bash
docker compose -f docker-compose.test.yml up -d   # inside a package that has it
pnpm test:integration
```

Codegen and migrations (in packages/apps that use them):

```bash
pnpm codegen            # spfn codegen run — regenerates route maps etc.
pnpm db:generate        # drizzle-kit generate — create a migration from schema changes
```

## The SPFN pattern

A feature is built as a vertical slice, each layer in its own file:

`Entity` (Drizzle table) → `Repository` (extends `BaseRepository`) → `Route`
(`route.get/post/...` with TypeBox validation) → `Router` (`defineRouter`) →
generated route map (`pnpm codegen`) → typed client (`createApi<AppRouter>()`).

`examples/vertical-integration-demo` is a minimal end-to-end reference for exactly
this flow. For the full pattern (auth, errors, services, DTOs) read
`packages/auth/README.md` and `packages/core/README.md`.

## Hard rules

1. **Never hand-edit generated files.** Route maps (`src/generated/route-map.ts`,
   `src/generated/route-map.*`) are produced by `pnpm codegen`. Change the source
   routes/router and re-run codegen; commit the regenerated output.
2. **Migrations come from the schema.** Don't write SQL migrations by hand — edit the
   Drizzle entity and run `pnpm db:generate`.
3. **`apps/` is local-only and gitignored.** Nothing under `apps/` belongs in a PR.
   Runnable examples go in `examples/` (a workspace member).
4. **Secrets never appear in output, code, logs, or commits.** Do not read or print
   values from `.env*` files — confirm a key's presence by name only. `.env.local` is
   gitignored; only `*.example` env files are committed, with placeholder values.
5. **Verify before you open a PR.** `pnpm build` and `pnpm test` must pass. If you
   touched routes, `pnpm codegen` must have been run and its output committed.

## Code style

The source of truth is the linter/formatter config, not prose — run the tooling and
match what it produces. The established house style is:

- **Allman braces** — every block's opening `{` goes on its own line.
- **4-space indentation, semicolons required.**
- Small, single-responsibility functions.

Do **not** run Prettier to "fix" formatting: Prettier cannot express Allman braces and
will rewrite the entire codebase to the wrong style. Style is enforced via ESLint
(`@stylistic`); run `pnpm lint` and match the surrounding code.

## Commits & PRs

- **Conventional Commits**: `type(scope): subject` — e.g. `feat(auth): …`,
  `fix(core): …`, `docs(examples): …`. A breaking change uses `!` (`fix(deps)!: …`).
- **DCO sign-off is required**: commit with `git commit -s` so every commit carries a
  `Signed-off-by:` line. See [CONTRIBUTING.md](./CONTRIBUTING.md#dco).
- Keep a PR to **one concern**. Small diffs review faster and break less.
- You are accountable for code you submit, including anything an agent generated — it
  must pass the checks and you must understand it.

## Versioning

Packages are in **beta** (`0.x.y-beta.N`) / alpha. Do not bump a package to a stable
(non-pre-release) version.

## Publishing

Packages are published to **two registries** (2026-07-22):

- **Private Gitea registry** (`git.superfunction.xyz/api/packages/superfunction/npm/`) —
  manual local publish via the named scripts below. This is what internal apps consume
  (`@spfn:registry` scope in `~/.npmrc`). No `npm login` to npmjs.org is needed locally.
- **Public npmjs** — automatic via `.github/workflows/publish-<pkg>.yml`: pushing a
  `packages/<pkg>/package.json` version change to `main` on GitHub triggers publish with
  the tag matching the version (`-alpha`/`-beta`/stable) **and syncs the `latest`
  dist-tag to that version**, so a bare `npm install` never serves a stale release.
  Re-running a workflow via workflow_dispatch re-syncs `latest` even for an
  already-published version (idempotent backfill). GitHub is kept current from Gitea
  (mirror); `.github/workflows/publish.yml` (v*-tag bulk publish) is the stale old path —
  per-package workflows supersede it.

To release a package:

1. Bump `packages/<pkg>/package.json` `version` (npm rejects re-publishing an existing
   version). Build it (`pnpm --filter <pkg> build`; for `@spfn/auth` also build its
   deps `@spfn/core` + `@spfn/notification` first).
2. Publish from the package dir with the **named script**, e.g.
   `cd packages/<pkg> && npm run publish:beta` (also `publish:alpha` / `publish:latest`).
3. Commit the version bump to `main` and push to `origin` (Gitea). The GitHub mirror
   picks it up and the Actions workflow publishes the same version to public npmjs.

Gotchas:

- **Never run a bare `pnpm publish` / `npm publish`.** `publishConfig.tag` is ignored by
  the npm/pnpm here, so a bare publish lands on the `latest` dist-tag regardless — use
  the `publish:beta` script (it passes `--tag beta`) for a beta release.
- `@spfn/*` scoped packages resolve to the Gitea registry automatically via the
  `@spfn:registry` scope in `~/.npmrc`. The unscoped `spfn` CLI is pinned to Gitea via
  its own `publishConfig.registry`.
- `RELEASE.md` / `.github/PUBLISHING.md` still describe the old public-npm + GitHub
  Actions flow; the process above supersedes them.
