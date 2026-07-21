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
  posts/
    2026-07-21-launch.md   # '/posts/launch' — default layout: post, sorted by date desc
  theme/
    tokens.json       # design tokens → CSS variables (--sf-*)
    custom.css        # free-form CSS layered after the variables
  public/             # static assets
```

### `spfn.site.yaml`

The presence of this file is the repo owner's consent to publish — registration
must reject repos without it (prevents serving third-party repos under a
phishing subdomain).

```yaml
name: Superfunction          # required
description: ...             # optional
root: site                   # optional, default 'site' ('.' = repo root)
locale: ko                   # optional
nav:                         # optional
  - label: Docs
    path: /docs
social:                      # optional
  github: https://github.com/spfn/spfn
```

### Frontmatter (minimal by design)

```yaml
title: Intro          # required
description: ...      # optional
layout: doc           # optional — landing | doc | post (defaults by location)
date: 2026-07-21      # YYYY-MM-DD; posts convention
draft: true           # optional — excluded from the loaded site
og: cover.png         # optional — OG image path inside public/
```

Markdown bodies are rendered with GFM and **sanitized** (script tags, iframes,
event handlers stripped) — published repos are untrusted input.

## Usage

```typescript
import { GithubContentSource, loadSite, validateSite } from '@spfn/pages/server';

const source = new GithubContentSource('https://github.com/owner/repo');

// Registration-time check: [] means publishable, entries are actionable feedback
const problems = await validateSite(source);

// Serving: full site model
const site = await loadSite(source);
site.config;    // SiteConfig (name, nav, ...)
site.pages;     // PageDoc[] — slug, frontmatter, sanitized html
site.posts;     // PageDoc[] — newest first
site.themeCss;  // :root { --sf-* } variables + custom.css, ready to inline
site.problems;  // per-file failures (file skipped, site still loads)
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
  `parseSiteConfig`, `parseDocument`, `tokensToCss`, `buildThemeCss`,
  `GithubContentSource`, `parseGithubUrl`, `MemoryContentSource`, `ContentSource`

## Status / roadmap

Beta. This package is the renderer core (stage 1). Coming next: Next.js layout
components + catch-all route integration, the site template repo (with
`site/AGENTS.md` authoring contract), then the hosted tenant edge
(registration, `*.spfn.app` subdomains, custom domains).
