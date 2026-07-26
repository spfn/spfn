# superfunction.xyz — story & IA (phase 0 → phase 2)

Status: **v3 agreed** (2026-07-26), reflected in `ia.html`. The landing now leads
with prototype-to-production for AI-assisted full-stack work. Type safety remains
a production guardrail rather than the primary positioning. `/posts` stays deferred
until the first release note is published.

## Story axes

1. **Prototype to production.** One scaffold starts a working full stack; the
   same architecture carries the product through deployment and operations.
2. **Built for agents.** One vertical slice per feature, each layer in its own
   file — humans and AI agents know where things go and can extend the product
   without inventing a new structure.
3. **Operate through the product.** Application-owned MCP tools let an agent
   operate the deployed system through its real domain layer without requiring
   a separate administrator dashboard first.
4. **Guarded for production.** Runtime validation, generated migrations,
   explicit boundaries, and end-to-end types keep fast iteration reviewable.

## Audience

- A founder or developer using AI to turn a product idea into a working business.
- A team that wants the speed of vibe coding without treating production as a rewrite.
- A developer who wants a codebase and operating surface agents do not get lost in.

## Sitemap (v3 — everything consumed on-site; see ia.html)

| Route             | Source                    | Notes                                          |
| ----------------- | ------------------------- | ---------------------------------------------- |
| `/`               | `pages/index.html`        | Designed landing                               |
| `/about`          | `pages/about.html`        | Designed manifesto — why SPFN exists (2026-07-22) |
| `/docs`           | `pages/docs.md`           | Get started                                    |
| `/docs/prototype-to-production` | `pages/docs/prototype-to-production.md` | Scaffold → build → deploy → MCP operations guide |
| `/docs/tutorial`  | `pages/docs/tutorial.md`  | Full-stack auth tutorial                       |
| `/docs/pattern`   | `pages/docs/pattern.md`   | SPFN pattern deep-dive                         |
| `/packages`       | `pages/packages.md`       | Package index — all links internal             |
| `/packages/<pkg>` | `pages/packages/<pkg>.md` (frontmatter `source:` → repo README) | 13 packages, served on-site |
| `/functions/<pkg>` | `pages/functions/<pkg>.html` | Designed landings for all 13 functions (core 2026-07-21; auth·storage·notification·monitor·cms·workflow·pages·pages-next·migrate·cli 2026-07-22; mcp·i18n 2026-07-23). Template: hero declaration → premise → core technique + why → what's-inside grid deep-linking into docs. |
| `/posts`          | renderer virtual index    | Deferred until the first release note          |
| `/posts/<slug>`   | `posts/YYYY-MM-DD-*.md`   | Deferred                                       |

GitHub remains the source only: docs are consumed on-site; relative links to
code files auto-resolve to repo blob URLs (renderer `repo` config).

## Journeys

- **J1 Builder**: `/` → `/docs/prototype-to-production` → `spfn create --mode full` → agent-assisted feature work.
- **J2 Operator**: deploy → connect `/mcp` → authorize agent → operate application tools.
- **J3 Deep evaluator**: `/docs` → `/docs/pattern` → `/docs/packages` → package reference.

## Navigation

Header on every page: brand → `/`, Docs, Posts (once posts exist), GitHub —
renderer nav for md pages, hand-written on the html landing (keep in sync with
`spfn.site.yaml`). Footer: mono ink band. No docs sidebar until the docs tree
outgrows ~5 pages.

## Landing narrative (top to bottom)

1. Hero — “Prototype to production” + explicit full-mode scaffold command.
2. Foundation — one scaffold, key connection, agent-legible slices, production guardrails.
3. Build loop — idea → scaffold → vertical slices → deploy → MCP operations.
4. Starting modes — recommended full (`core`, `auth`, `i18n`, `mcp`) versus bare (`core`).
5. Operations — application-owned MCP tools instead of a prerequisite admin dashboard.
6. Functions grid — optional capabilities that preserve the same architecture.
7. CTA — follow the prototype-to-production guide + GitHub.

## Positioning boundary

“Vibe coding” describes the fast build loop, not disposable output. Copy should pair
AI speed with production continuity and avoid presenting type safety as the product.
