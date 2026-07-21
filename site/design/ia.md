# superfunction.xyz — story & IA (phase 0)

Status: **v1 agreed** (2026-07-21, discussion in session).

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

## Sitemap

| Route  | Source                  | Notes                                   |
| ------ | ----------------------- | --------------------------------------- |
| `/`    | `pages/index.html`      | Designed landing (phase 3)              |
| `/docs`| `pages/docs.md`         | Get started — markdown, exists          |
| `/posts` | `posts/*.md`          | Later — changelog / release notes       |

## Landing narrative (top to bottom)

1. Hero — one-liner + `npx spfn@beta create` command.
2. Why — typed e2e, vertical slice, batteries as packages, Next.js native.
3. Code walkthrough — entity → route → typed client, the type flowing through.
4. Packages grid — `@spfn/core`, `auth`, `storage`, `notification`, ….
5. CTA — Get started (`/docs`) + GitHub.

## Open items

- Whether the packages grid links to GitHub READMEs or waits for docs mounts.
