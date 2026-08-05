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
pnpm audit              # known vulnerabilities in the production dependency graph
pnpm audit:all          # the same, including build tooling
```

**A dependency's version range is a security surface.** A published `peerDependencies`
range is what an adopter resolves against, so a range that still admits a vulnerable
release ships that vulnerability to every app installing the package. `@spfn/*` packages
that couple to Next.js require `^16.2.11` — the floor that clears both CVE-2025-66478
(remote code execution through React Server Components) and the Server Components denial
of service. Next.js 15 is not supported: its patches landed per minor line
(15.0.5, 15.1.9, 15.2.6, …), so no single caret range can express "patched".

Advisories are usually published long after the affected code is written, which is why
`.github/workflows/security-audit.yml` runs daily rather than only on a pull request. It
fails on a critical finding in the production graph and reports everything else.

Per package (run inside `packages/<name>/`):

```bash
pnpm build              # tsup build (+ madge circular check)
pnpm type-check         # tsc --noEmit
pnpm test               # vitest run
pnpm test:unit          # unit tests only (where present)
pnpm check:circular     # madge --circular
```

Integration tests need PostgreSQL and Redis. They run against the machine's own
installation, not containers: PostgreSQL is shared, one logical database per
package (`spfn_test`, `spfn_auth_test`, `spfn_cms_test`), and Redis runs as four
small instances on dedicated ports because the cache tests need a replication
pair and a password-protected instance. One script sets all of it up:

```bash
./scripts/test-services.sh start    # from the repo root; also `stop` and `status`
pnpm test                           # integration tests are part of the default run
```

Override the database with `TEST_DATABASE_URL` if yours does not live on 5432.

**Tests run one at a time, on purpose.** The root `pnpm test` passes
`--concurrency=1` to turbo and every package's vitest config pins a single worker
running one file at a time. Two reasons: the packages share one PostgreSQL and one
Redis, and a developer machine has fewer cores than turbo and vitest would
otherwise both fan out across — a run that starves itself times out before its
assertions get to run. Do not raise either number to make a run finish sooner.
Per-package CI (`pnpm test` inside `packages/<name>/`) is unaffected.

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

`examples/01-minimal-api` is the smallest end-to-end reference for this flow, and
`examples/02-database-crud` adds the entity and repository layers. For the full pattern
(auth, errors, services, DTOs) read `examples/03-auth` plus `packages/auth/README.md`
and `packages/core/README.md`.

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
  The named scripts run `scripts/publish-package.mjs`, which publishes on the requested
  channel **and then moves `latest` onto the same version** — mirroring what the GitHub
  workflow does for public npmjs.
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
- **`npm view @spfn/…` reads Gitea, not npmjs — and `--registry` does not override it.**
  A scope entry in `~/.npmrc` wins over the `--registry` flag, so a dist-tag or version
  reported this way describes the private registry. To inspect public npmjs, query it
  directly: `curl -s https://registry.npmjs.org/@spfn%2Fauth`. Issue #52 was filed against
  the wrong registry for exactly this reason.
- `.github/PUBLISHING.md` is the long form of the process above — same two registries,
  with the exact commands. `RELEASE.md` describes the retired tag-triggered release and
  is kept for history only; nothing publishes off a git tag any more.

<!-- superself:begin v0.5.1 -->
## Project state (superself)

Project state — goals, decisions, work units, reports — is version-controlled
by the `self` CLI, outside this repository. Skip this section if the `self`
command is unavailable.

- Session start: run `self context` and treat its output as current truth.
- Write for the reader by default: answers to the person in their language,
  records — events, decisions, reports, conventions — in English, so a record
  stays readable to whoever opens it next. A project that wants it otherwise
  records its own convention.
- Substantive work attaches to a work unit: `self work add "<required outcome>"`,
  then `self work start <id>`. Report progress with `self report <id> "<summary>"`
  after committing — HEAD is attached as evidence automatically.
- Done is a judgment, and the claim must carry evidence: `self work done <id>`
  closes the unit only when a report carries a commit or an artifact, or the
  done itself states one — `self work done <id> --report "<what verifiably
  happened>"`. A bare claim is refused, and declared criteria gate it.
- A record's text is immutable once confirmed, so a correction restates it:
  `--supersedes <id>` on any add verb records the new wording and carries the
  lineage. `retract` withdraws a record with nothing replacing it, and `retire`
  is for an outcome given up or moved — neither is a wording fix.
- Record decisions the user confirmed: `self decide "<text>" --why "<reason>"`.
  Use `--proposed` when the user has not confirmed. One decision per event.
- Blocked? `self work block <id> --on decision|dependency|external --why "..."`.
  Superseded or moved? `self work retire <id> --why "..." [--successor <id>]` —
  never mark it done and never leave it falsely blocked.
- Found a gap between an objective and current state? Propose the work with
  `self work propose` and its full brief; the user accepts or declines it.
- Proposed next work, or suggested continuing in the next session, and the
  user approved? Register it with `self work add` right then, with the
  context behind the proposal — an approved plan that is never registered is lost.
- Deferring work for later? Attach a scoping brief the moment you create it:
  `self report <id> --file <path>` covering scope, design anchors, and known
  pitfalls — a bare outcome line loses the context that created the work.
- A branch reaches main through a GitHub pull request: PR review and CI own
  merge control. superself owns context and the work graph, not the merge gate.
- Never hand-edit generated state files or anything under `.superself/`.

This block is the short form. The installed CLI carries the rest — what each
concept is, when to reach for it, and the order the verbs go in:

- `self help agents` — how a session drives this CLI, start to finish
- `self help context` — what `self context` renders, and why something is missing from it
- `self help records` — one entity behind every record kind, and how a record is corrected
- `self help placement` — scope, priority and exposure — how a record earns its place in context
- `self help work` — the work graph: outcomes, evidence, criteria, and proposals
- `self help goals` — long-term goals, objectives, milestones, and what reaching one takes
- `self help workspace` — the store, the projects in it, and moving it between machines
<!-- superself:end -->
