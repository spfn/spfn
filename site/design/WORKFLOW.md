# Site design workflow (for AI agents)

How a designed site gets built on `@spfn/pages`: **html-first for designed
pages, markdown for docs**. This file is the process contract; `../AGENTS.md`
is the content contract. All work-in-progress lives in this `design/`
directory — the renderer never serves it.

## Ground rules

- **Every phase ends in a user discussion.** Show the artifact, get agreement,
  then move on. Never run ahead of the last agreed artifact.
- **Artifacts are files, not chat.** Each phase writes its outcome here so a
  future session (or another agent) picks up exactly where this one stopped.
- **html artifacts are self-contained** — inline CSS, no external requests.
  Served pages (`../pages/*.html`) may additionally link `/theme.css`, nothing
  else external.
- **Avoid the obvious references.** linear.app / stripe.com / vercel.com and
  their lookalikes are the default gravity of AI-generated design — pull away
  from them unless the user explicitly asks.
- Tokens agreed in phase 2 are synced into `../theme/tokens.json`; recurring
  layouts/components extracted in phase 4 are cataloged in `components.md`.

## Phases

### 0 — Story & IA → `ia.md`

Explore the repo (README, packages, docs, examples) until you can state what
the product is and who arrives at the site. Propose the story axes and a
minimal sitemap, discuss with the user, record the agreed version in `ia.md`.

### 1 — References & moodboard → `moodboard.html`

Collect references with a distinct point of view (see ground rules). Present
3–4 direction candidates in one self-contained html moodboard — each with
named references, palette, type specimen, and a signature motif. Discuss;
record the picked (or mixed) direction at the top of the file.

### 2 — Design system → `system.html` + `system.md`

Turn the picked direction into a system: color tokens, type scale, spacing,
voice & copy rules, motif usage. `system.html` is the human-visible specimen;
`system.md` is the same system written for agents to read while building
pages. Sync final tokens to `../theme/tokens.json`.

### 3 — Landing → `../pages/index.html`

Build the landing as a full standalone html document following `system.md`
(own `<head>`: title, description, og meta, favicon link — html pages get no
automatic metadata). Iterate with screenshots until the user signs off.

### 4 — Remaining pages → `components.md`

Discuss which pages come next; build them one by one. While building, extract
repeated layout/component patterns (markup + css) into `components.md` and
reuse — later pages should be assembled, not redesigned.
