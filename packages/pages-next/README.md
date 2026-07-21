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

Every output is recorded in `public/.spfn-pages-sync.json`; the next run deletes
recorded outputs it no longer produces (a moved landing, a removed asset), so
stale pages never ghost into the static export. Files sync never wrote — things
you placed in `public/` by hand — are left alone.

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
`/posts` index is served when no page claims that slug. The footer
(`.sf-footer`) repeats the site brand (`.sf-footer-brand`) and nav
(`.sf-footer-nav`), then appends social links — skipping any social entry
whose URL already appears in the nav — with brand casing via `socialLabel`
(`github` → `GitHub`).

`DocLayout` shows a **section sidebar** from `site.sections` (the navigation
trees `loadSite` derives from doc slugs): the tree for the page's first path
segment, current page marked `aria-current`, label-only group nodes for
segments nobody serves. The section root renders as the first flat item and
its children as the top-level list — the whole tree does not nest under the
index page's title. Labels come from frontmatter `navTitle` (fallback
`title`). Sections with fewer than two docs render no sidebar
(a lone page navigates nowhere). Layout is sticky-aside on wide screens and
stacks above the content below `56rem`; styling rides on `.sf-sidebar` /
`.sf-doc-shell` in `DEFAULT_CSS`, overridable via theme tokens and
`custom.css`.

`generateMetadata` also emits the site's well-known assets: `site.favicon`
becomes the `<link rel="icon">` (svg/png/ico/jpg, typed by extension) and
`site.ogImage` the default `og:image` (frontmatter `og:` wins per page). When
`spfn.site.yaml` sets `url:`, it becomes `metadataBase` so OG image URLs
resolve absolute.

## Status

Beta, stage 3 of the frontend serving primitive. Deploy targets being
verified end-to-end: Cloudflare Pages, Vercel, SPFN hosting. Coming next:
the site template repo (with `site/AGENTS.md`), then the hosted tenant edge.
