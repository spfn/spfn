# Poster components — extracted patterns (phase 4)

Repeated markup + css shared by the designed html pages
(`pages/index.html`, `pages/functions.html`, `pages/functions/core.html`,
`pages/functions/mcp.html`, `pages/functions/i18n.html`,
`pages/about.html`). Pages are self-contained (inline CSS), so these are
**copy templates**, not imports — copy the block, keep the class names, and
change content only. When a pattern changes, update it here and sweep the
pages that use it.

## Page scaffold

Every page starts from the same skeleton:

- `<head>`: title (`X — Superfunction`), description, og:title/description/
  image(`https://superfunction.xyz/og.png`)/url/type, favicon `/favicon.svg`.
- Reset + tokens: `* { margin:0; padding:0; box-sizing:border-box; border-radius:0; }`
  and the `:root` token block (cobalt/ink/white/signal/gray/gray-line +
  grotesk/mono stacks) — values must match `theme/tokens.json`.
- `.inner { max-width:1120px; margin:0 auto; padding:0 24px; }` — every band's
  content wrapper; keeps header/hero/footer edges aligned.

## Header nav

`header` with `border-bottom:1px solid ink`; `.inner.nav` flex row 64px;
`.brand` = S mark + wordmark 17/800 — the S is the superself symbol (two
interlocking crescents, `site/public/logo.svg` / inline SVG on html pages,
19px tall, cobalt via `currentColor`); md pages get it from
`custom.css` `.sf-brand::before`. Right-aligned `nav` gap 28px, 14.5/600
links, cobalt hover.
Links: Docs · Functions · About · GitHub — **must match `spfn.site.yaml`
`nav:`** (md pages render from it). External links (GitHub) carry
`target="_blank" rel="noopener"` — SiteShell does the same for md pages
automatically.

## Hero (kicker + display + sub + strip)

`.hero` top-pad 72–96px → `.kicker` (mono-label, 0.12em) → `h1.display`
(clamp uppercase 800, line-height ~0.98; landing goes to 108px, subpages cap
at 76px; `em` or `.inkline` flips cobalt/ink) → `.sub` (17/1.6, max 58ch) →
`.strip` (14px band, flex 2.5 cobalt / 1.2 ink / 0.35 signal). The strip is
full-bleed — it sits outside `.inner`.

## Section rhythm

One rule on every page: `section { padding: 120px 0 0; }` +
`section:last-of-type { padding-bottom: 120px; }` (80px both at 600px).
Sections are separated by whitespace only — never add inline
`style="padding-top: 0"` per section. Hero scale: landing 96px top /
strip margin 72px; subpages 72px top / strip margin 56px (mobile 64/56).

## Section header

`.sec-head`: mono index (`01`) + 1px flex rule + uppercase mono name,
`margin-bottom: 44px`. Then `h2.sec-title` clamp(28–40px)/800 with
`margin-bottom: 40px`, `em` = cobalt highlight word.

## Cell grid (why-grid / obs-grid / pkg-grid)

1px ink-bordered grid, cells split by 1px ink rules: `repeat(4,1fr)` desktop
→ `1fr 1fr` at 900px (kill the 3rd cell's left border, add border-top on rows
past the first) → `1fr` at 600px. Cell: mono num (11px gray) + h3 19/700 +
p 13.5/1.6 `#3c4248`. Link-cell variant (`.pkg`) inverts to cobalt/white on
hover, `.tag` mono footer (`DOCS →` / `FUNCTION →`) pinned with
`margin-top:auto`.

## Split (two-column contrast)

`about.html` `.split`: `1fr 1fr` under a 1px top rule, 1px rule between
columns, mono `slabel` over h3 22/700 + body 15/1.65 max 52ch. Collapses to
stacked with border-top at 600px.

## Wire diagram

`.wireflow` flex row: `.wnode` (1px ink stroke, mono 12px, pad 9px 14px),
`.wwire` (1px line, 5px square terminal via `::after`), hot node/wire in
cobalt. Caption below: `.flow-note` mono-label gray (`FIG 01 — …`).
Wraps with `flex-wrap` under 900px.

## Module row (about)

Hairline-bounded mono link row: `ALREADY BUILT —` gray label + uppercase
package links, cobalt hover. Use for compact "see also" strips.

## CTA band

`.cta-band` cobalt, 56px pad (≤220px tall per system.md): uppercase h2 +
right-aligned `.btns` (`.btn-white`, `.btn-outline-w`). Block buttons
14px 28px / 15px 700.

## Footer

Ink band 34px pad, mono 12px row: `SUPERFUNCTION` + underlined uppercase
links (DOCS · FUNCTIONS · ABOUT · GITHUB) + right `.dim`
`© 2026 FXY INC. · @SPFN/* — BETA`. Keep in sync with header nav; md pages
carry the company line via `spfn.site.yaml` `footerNote`.
