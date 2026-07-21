# superfunction.xyz — story & IA (phase 0 → phase 2)

Status: **v2 agreed** (2026-07-21), drawn in `ia.html`. Decisions: docs starts
with `pattern` + `packages`; `/posts` is deferred until the first release note
is published (nav item appears then); package doc mounts (`/docs/<pkg>` from
repo READMEs) are in scope as renderer feature work, not deferred.

## Story axes

1. **Typed end to end.** One type system from Drizzle entity to the generated
   client — change a route, every consumer is type-checked. The compiler
   catches what integration tests used to.
2. **Built for agents.** One vertical slice per feature, each layer in its own
   file — humans and AI agents both know exactly where things go. The
   framework is structured the way agents work best.

## Audience

- A developer evaluating a full-stack TypeScript framework for a Next.js app.
- A developer who builds primarily with AI agents and wants a codebase
  structure agents don't get lost in.

## Sitemap (v2 draft — see ia.html for the diagram)

| Route            | Source                    | Notes                                          |
| ---------------- | ------------------------- | ---------------------------------------------- |
| `/`              | `pages/index.html`        | Designed landing (phase 3 draft exists)        |
| `/docs`          | `pages/docs.md`           | Get started — exists                           |
| `/docs/pattern`  | `pages/docs/pattern.md`   | NEW — SPFN pattern deep-dive (slice anatomy, codegen, errors) |
| `/docs/packages` | `pages/docs/packages.md`  | NEW — package index; links to GitHub READMEs   |
| `/docs/<pkg>`    | —                         | FUTURE — repo README mounts (needs docs-mount) |
| `/posts`         | renderer virtual index    | Appears with the first post                    |
| `/posts/<slug>`  | `posts/YYYY-MM-DD-*.md`   | NEW — release notes / changelog                |

## Journeys

- **J1 Evaluator**: `/` → `/docs` → `npx spfn create` → GitHub.
- **J2 Builder** (returning): `/docs` → `/docs/pattern` → `/docs/packages` → package README.
- **J3 Follower**: `/posts` → post → `/docs`.

## Navigation

Header on every page: brand → `/`, Docs, Posts (once posts exist), GitHub —
renderer nav for md pages, hand-written on the html landing (keep in sync with
`spfn.site.yaml`). Footer: mono ink band. No docs sidebar until the docs tree
outgrows ~5 pages.

## Landing narrative (top to bottom)

1. Hero — one-liner + `npx spfn@beta create` command.
2. Why — typed e2e, vertical slice, batteries as packages, Next.js native.
3. Code walkthrough — entity → route → typed client, the type flowing through.
4. Packages grid — `@spfn/core`, `auth`, `storage`, `notification`, ….
5. CTA — Get started (`/docs`) + GitHub.

## Open items

- Whether the packages grid links to GitHub READMEs or waits for docs mounts.
