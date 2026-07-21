# Site authoring contract (for AI agents)

This directory is a **publishable website**, rendered by `@spfn/pages`. You (the
authoring AI) edit markdown, theme tokens, and assets here; a push is a deploy.
This file is the contract — read it before touching anything under `site/`.

## Structure

```
../spfn.site.yaml   # site meta — name/url/repo/nav/social + mounts (repo docs served as routes)
pages/              # '/', '/about', '/docs/intro' … from the file path
  index.md          # '/' — layout defaults to `landing`
  *.md              # other pages — layout defaults to `doc`
  *.html            # ESCAPE HATCH: full standalone document, served verbatim
posts/              # '/posts/<slug>' — dated content, newest first
  YYYY-MM-DD-slug.md
theme/
  tokens.json       # design tokens → `--sf-*` CSS variables
  custom.css        # free-form CSS, layered after tokens
public/             # static assets, served from '/' ('public/img/x.png' → '/img/x.png')
design/             # NOT SERVED — design workflow workspace, see design/WORKFLOW.md
  favicon.svg       # WELL-KNOWN: auto-linked favicon (or .png/.ico/.jpg — svg/png work as-is, no .ico needed)
  og.png            # WELL-KNOWN: site-wide OG image, 1200×630 (or .jpg/.webp); frontmatter `og:` overrides per page
```

## Frontmatter (all fields except `title` optional)

```yaml
title: Getting Started        # required
description: One sentence.    # meta/OG description
layout: doc                   # landing | doc | post — defaults by location
date: 2026-07-21              # posts convention (also in the file name)
draft: true                   # excluded from the published site
og: img/cover.png             # OG image path inside public/
order: 1                      # sidebar position among siblings (unordered pages after, by title)
source: packages/core/src/db/README.md   # serve this repo doc at the page's route (see rule 7)
```

## Rules

1. **Link by repo path.** Between markdown files use relative file links —
   `[Docs](./docs.md)`, `[Launch](../posts/2026-07-21-launch.md)` — the renderer
   rewrites them to routes. Assets: `![x](../public/img/x.png)`.
2. **`doc`/`post` bodies start at `##`.** The layout renders the frontmatter
   `title` as the page `<h1>`. Landing pages own their full body, `#` included.
3. **No raw HTML tricks in markdown** — scripts/iframes/handlers are stripped.
   Need real HTML/JS? Create a `pages/*.html` file instead: it is served
   verbatim as its own document (you own everything, including `<title>`).
   Link the theme with `<link rel="stylesheet" href="/theme.css">` if wanted.
4. **Theme changes go through `theme/tokens.json` first** (`--sf-color-accent`,
   `--sf-width-content`, `--sf-font-body`, …); use `custom.css` only for what
   tokens can't express.
5. **Code fences get languages** (` ```ts `) — they are syntax-highlighted
   server-side, light and dark.
6. **Do not touch the renderer scaffolding** (`website/` in this repo) or
   generated dirs (`website/public/` is build output of `spfn-pages sync`).
7. **Curate repo docs with `source:` pages, not directory mounts.** A page whose
   frontmatter has `source: <repo-path>.md` serves that doc at the page's own
   route — the file's location picks the URL (`pages/packages/core/db.md` →
   `/packages/core/db`, no `src/` leakage). The page body is an optional preface
   rendered before the doc; the page's `title`/`description` win (the doc's first
   `#` heading is stripped). Links anywhere to the referenced repo file
   automatically land on the curated page. Single-file `mounts:` in
   `spfn.site.yaml` remain for serve-as-is docs (package READMEs).
