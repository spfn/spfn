# @spfn/pages

Serve a website from a public GitHub repo. The repo opts in with a root-level
`spfn.site.yaml`, keeps AI-authored markdown content under a content root
(default `site/`), and this package turns it into a validated, sanitized,
render-ready site model. No build pipeline on the author's side — push is deploy.

This is the first source driver of SPFN's **frontend serving primitive**: the
tenant edge (registration, `*.spfn.app` subdomains, custom domains, caching) is
shared infrastructure; content sources plug in via the `ContentSource` interface.

## The site spec

A publishable repo looks like this:

```
spfn.site.yaml        # REQUIRED at repo root — opt-in proof + site meta + content root
site/                 # content root (config `root`, default 'site'; existing repos keep their structure)
  AGENTS.md           # instructions for the authoring AI (the spec's real interface)
  pages/
    index.md          # '/' — default layout: landing
    about.md          # '/about' — default layout: doc
    docs/intro.md     # '/docs/intro'
    playground.html   # '/playground' — escape hatch: full document served verbatim
  posts/
    2026-07-21-launch.md   # '/posts/launch' — default layout: post, sorted by date desc
  theme/
    tokens.json       # design tokens → CSS variables (--sf-*)
    custom.css        # free-form CSS layered after the variables
  public/             # static assets
    favicon.svg       # well-known: auto-detected favicon (also .png/.ico/.jpg/.jpeg, in that order after svg)
    og.png            # well-known: site-wide OG image default (also .jpg/.jpeg/.webp)
```

Well-known `public/` assets surface on the loaded site as `site.favicon` /
`site.ogImage` (served URLs, e.g. `/favicon.svg`) — renderers emit the
`<link rel="icon">` and default `og:image` from them. SVG/PNG favicons are
natively supported by browsers, so no `.ico` conversion is ever needed. A page's
frontmatter `og:` overrides the site-wide OG image.

### `spfn.site.yaml`

The presence of this file is the repo owner's consent to publish — registration
must reject repos without it (prevents serving third-party repos under a
phishing subdomain).

```yaml
name: Superfunction          # required
description: ...             # optional
root: site                   # optional, default 'site' ('.' = repo root)
url: https://example.com     # optional — canonical origin; makes og:image URLs absolute
repo: https://github.com/spfn/spfn   # optional — canonical repo; non-doc links resolve here
locale: ko                   # optional
nav:                         # optional
  - label: Docs
    path: /docs
social:                      # optional — lowercase keys; renderers display brand
  github: https://github.com/spfn/spfn   # casing via socialLabel() ('github' → 'GitHub')
mounts:                      # optional — repo docs served as site routes
  - source: packages/core/README.md      # a .md file, or a directory
    route: /packages/core
    title: "@spfn/core"                  # optional title override
```

### Mounts — repo docs served on-site

Mounts pull documentation that lives with the code (READMEs, guide trees)
into the site, so docs are consumed on-site instead of on GitHub. A `.md`
source serves that one file at `route`; a directory source serves every `.md`
beneath it at `route/<relative-path>` (README/index files collapse onto their
directory). Mounted docs are parsed leniently: frontmatter optional, title
falls back to the first `#` heading (stripped from the body), then the file
name. Loaded docs surface as `site.mounted`, routable like pages.

Link resolution inside any rendered markdown, in order: a relative link to a
served markdown file (authored, referenced, or mounted) → its route; a `public/`
asset → its served URL; any other existing repo file → `<repo>/blob/main/<path>`
(images use `/raw/`), which is why mounts want `repo` set — without it those
links stay as written and a problem is reported. Conflicts (a mount route
already served by a page, post, or earlier mount) skip the file and land in
`problems`.

### Source pages — curated references

The curated alternative to a directory mount: a page whose frontmatter has
`source: <repo-path>.md` serves that repo doc's content at the page's own
route. The page file's location picks the URL — `pages/packages/core/db.md`
referencing `packages/core/src/db/README.md` serves at `/packages/core/db`,
with no `src/` leaking into the URL the way a directory mount would.

- The page body is an **optional preface**, rendered before the referenced doc.
- Links inside the referenced content resolve from the *referenced file's* repo
  location; links in the preface resolve from the page's.
- The page's frontmatter governs `title`/`description`/`layout`/`draft`; the
  referenced doc is parsed leniently like a mount (its first `#` heading is
  stripped — the layout renders the page title).
- Relative links anywhere on the site to the referenced repo file rewrite to
  the curated page's route (a source page's claim beats a mount's for the same
  file; the first page to reference a file wins).
- A `source` that is missing from the repo or not a `.md` file is a per-file
  problem: reported, page skipped.

### Frontmatter (minimal by design)

```yaml
title: Intro          # required
description: ...      # optional
layout: doc           # optional — landing | doc | post (defaults by location)
date: 2026-07-21      # YYYY-MM-DD; posts convention
draft: true           # optional — excluded from the loaded site
og: cover.png         # optional — OG image path inside public/
order: 1              # optional — sidebar position among siblings (unordered pages sort after, by title)
source: packages/core/src/db/README.md   # optional — repo doc served at this page's route
```

### Markdown rendering

Markdown bodies are rendered with GFM and **sanitized** (script tags, iframes,
event handlers stripped) — published repos are untrusted input. On top of that
the pipeline produces, in order:

- **Repo-aware links** — relative references are rewritten to served routes:
  `./about.md` → `/about`, `../../posts/2026-07-21-launch.md` → `/posts/launch`,
  `../public/img/cover.png` → `/img/cover.png`. Absolute URLs, site-absolute
  paths, and `#anchors` pass through untouched; authors link files the way the
  repo is laid out and the site just works.
- **Heading anchor ids** — GitHub-style slugs (`## Getting Started` →
  `id="getting-started"`), added after sanitization and without a clobber prefix
  so plain `#getting-started` links work with no client JS.
- **Code highlighting** — shiki dual-theme output (`github-light` inline,
  `github-dark` via `--shiki-*` CSS variables; the flip is included in
  `site.themeCss`). Unknown languages fall back to plain text.

### HTML pages (the escape hatch)

`pages/*.html` files are served **verbatim as full standalone documents** — no
layout wrapping, no sanitization, scripts included; the author owns the content.
Slug rules match markdown pages (`pages/playground.html` → `/playground`); a slug
already taken by a markdown page or post is a per-file conflict (the HTML file is
skipped and reported). The title comes from the document's `<title>` tag. Theme
tokens are opt-in: link the site's theme stylesheet if you want them.

Because HTML pages run author scripts, tenant isolation (serving each site on
its own registrable subdomain — Public Suffix List registration for the hosted
edge) is a prerequisite before opening registration to third parties.

## Usage

```typescript
import { GithubContentSource, loadSite, validateSite } from '@spfn/pages/server';

const source = new GithubContentSource('https://github.com/owner/repo');

// Registration-time check: [] means publishable, entries are actionable feedback
const problems = await validateSite(source);

// Serving: full site model
const site = await loadSite(source);
site.config;     // SiteConfig (name, nav, ...)
site.pages;      // PageDoc[] — slug, frontmatter, sanitized html
site.posts;      // PageDoc[] — newest first
site.htmlPages;  // HtmlPage[] — raw full documents, served verbatim
site.sections;   // NavNode[] — per-section nav trees derived from doc slugs (sidebar source)
site.themeCss;   // code-theme flip + :root { --sf-* } variables + custom.css, ready to inline
site.problems;   // per-file failures (file skipped, site still loads)
```

- `GithubContentSource` fetches the tree via the GitHub API and files via
  raw.githubusercontent.com, both with ETag conditional requests (304s don't
  count against the API rate limit). Pass `{ token }` to raise limits.
- `MemoryContentSource` backs tests and local previews.
- Per-file failures never take the site down — they land in `problems` and the
  file is skipped. Only a missing/invalid `spfn.site.yaml` is fatal.

## Exports

- `@spfn/pages` — types, TypeBox schemas (`SiteConfigSchema`, `FrontmatterSchema`), errors
- `@spfn/pages/server` — `loadSite`, `validateSite`, `renderMarkdown`,
  `rehypeRewriteRefs`, `parseSiteConfig`, `parseDocument`, `tokensToCss`,
  `buildThemeCss`, `GithubContentSource`, `parseGithubUrl`,
  `MemoryContentSource`, `ContentSource`

## Status / roadmap

Beta. This package is the renderer core. The Next.js integration (layouts,
catch-all route helpers, static export + sync CLI) lives in
[`@spfn/pages-next`](../pages-next/README.md); self-deploy targets are Vercel,
Cloudflare Pages, and any static host. Coming next: the site template repo
(with `site/AGENTS.md` authoring contract), then the hosted tenant edge
(registration, `*.spfn.app` subdomains, custom domains).
