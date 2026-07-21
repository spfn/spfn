# @spfn/pages-next

Next.js integration for [`@spfn/pages`](../pages/README.md) — turns a validated
site model into a deployable site. One package, two modes:

- **Single-tenant (self-deploy)** — the content repo carries a ~4-file Next.js
  scaffold and deploys anywhere Next.js or static output runs: Vercel,
  Cloudflare Pages, your own server. Static export (`output: 'export'`) is fully
  supported.
- **Multi-tenant (SPFN hosting)** — the hosted edge reuses the same layouts and
  helpers, resolving the tenant per request. No scaffold needed in the content
  repo; registering the repo link is enough.

## Self-deploy usage

The whole route surface is an optional catch-all:

```tsx
// app/[[...slug]]/page.tsx
import { createSitePages } from '@spfn/pages-next';
import { FsContentSource } from '@spfn/pages/server';

const site = createSitePages({ source: () => new FsContentSource('.') });

export const generateStaticParams = site.generateStaticParams;
export const generateMetadata = site.generateMetadata;
export default site.Page;
```

`FsContentSource('.')` reads the checked-out repo directly — builds see exactly
the commit they run on, no GitHub API calls, no rate limits.

Build script (`package.json`):

```json
{ "build": "spfn-pages sync && next build" }
```

`spfn-pages sync` materializes the two things Next.js can't render from the
site model into `public/` before the build:

- raw HTML escape-hatch pages (`site/pages/*.html` → `public/<slug>/index.html`)
- `site/public/` assets (copied as-is, binary-safe)

For Cloudflare Pages / any static host, set `output: 'export'` in
`next.config.js`. On Vercel the default runtime build works too. Push-to-update
is the host's standard deploy hook wired to the repo.

## Exports

- `createSitePages({ source, revalidate? })` → `{ generateStaticParams, generateMetadata, Page, getSite }`
- Layouts: `SiteShell`, `LandingLayout`, `DocLayout`, `PostLayout`, `PostsIndexLayout`
- `DEFAULT_CSS` — baseline stylesheet, every value overridable via `--sf-*` tokens
- `syncSite({ root, out })` — programmatic form of the CLI

Conventions the layouts assume: `doc`/`post` pages render the frontmatter
`title` as the page `<h1>`, so markdown bodies start at `##`; a virtual
`/posts` index is served when no page claims that slug.

## Status

Beta, stage 3 of the frontend serving primitive. Deploy targets being
verified end-to-end: Cloudflare Pages, Vercel, SPFN hosting. Coming next:
the site template repo (with `site/AGENTS.md`), then the hosted tenant edge.
