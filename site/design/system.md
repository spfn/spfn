# superfunction.xyz design system — "Poster" (phase 2)

Status: **v2 agreed** (2026-07-21). Direction: Poster Swiss (E) + wire
diagrams (G), revised after discussion — large cobalt fields strained the eye,
so the system is **white-first**: cobalt lives in type and blocks, not washes.
This file is the agent-readable contract; `system.html` is the same system as
a visual specimen. Build every page from these rules.

## Principles

- **Poster, not app.** Hard edges, big type, solid blocks. No gradients,
  no shadows, no glass, no glow, no rounded corners (`border-radius: 0`
  everywhere).
- **White-first.** The page ground is white. Cobalt appears as display type,
  buttons, and thin strips — **never as a full hero or section field**. The
  only cobalt fields allowed are narrow bands (strip dividers ~12–16px, a CTA
  band ≤ ~220px tall). Ink fields carry code sections and the footer.
- **One diagram language.** Structure is drawn as wire diagrams: 1px stroke
  boxes, 1px wires, a small square terminal, mono labels. The hot element in a
  diagram takes the accent of its ground.
- **Ink rules everywhere.** 1px hairlines separate content; sections open with
  a mono index label (`01 — WHY SPFN`).

## Color tokens

| Token          | Value     | Use                                            |
| -------------- | --------- | ---------------------------------------------- |
| `cobalt`       | `#1d34f3` | Identity. Display type, buttons, strips, links, hot nodes |
| `ink`          | `#10161a` | Text on white, code sections, footer, hairlines |
| `white`        | `#ffffff` | Page ground, text on cobalt/ink                |
| `signal`       | `#ff3b1f` | Micro-accent only: marks, small bars, ≤1 per view |
| `gray`         | `#8a9096` | Secondary text, captions                       |
| `gray-line`    | `#d9dce0` | Hairlines on white where ink is too heavy      |

On-ground text: white→ink, cobalt-band→white, ink→white. Links are cobalt on
white, white-underlined on cobalt/ink. `signal` never colors text. Display
headlines on white may be set in cobalt, ink, or a mix of both.

## Type

- **Grotesk** (display + UI): `-apple-system, 'Helvetica Neue', Arial, sans-serif`.
- **Mono** (code, labels, captions): `ui-monospace, 'SF Mono', Menlo, monospace`.

| Role      | Size/line       | Weight | Notes                                  |
| --------- | --------------- | ------ | -------------------------------------- |
| Display   | 76/0.98         | 800    | UPPERCASE, tracking -0.03em, hero only |
| H1        | 48/1.05         | 800    | tracking -0.025em                      |
| H2        | 30/1.15         | 700    | tracking -0.015em                      |
| H3        | 19/1.3          | 700    |                                        |
| Body      | 16/1.6          | 400    | max-width 62ch                         |
| Small     | 13.5/1.55       | 400    | gray                                   |
| Mono-label| 12/1.4          | 500    | UPPERCASE, tracking +0.1em             |
| Code      | 13.5/1.7        | 400    | mono                                   |

## Spacing & layout

- Base unit 8px; section padding 96px top/bottom (64px on mobile).
- Content max-width 1120px, gutter 24px; body copy max-width 62ch.
- Grid: CSS grid per section; poster sections may use hard column splits
  (e.g. 7/5) with a 1px rule between columns.

## Components

- **Block button** — rectangular, no radius. Primary: ink block/white text on
  white ground; white block/cobalt text on cobalt ground. Secondary: 1px
  outline of the text color. Padding 14px 28px, weight 700.
- **Section header** — mono index (`01`) + rule + uppercase mono title, above
  the section's H2.
- **Bar row** — stacked solid color bars (white/ink/signal) used as a
  poster-graphic divider or stat strip.
- **Wire diagram** — nodes: 1px stroke, mono 12px label, padding 8px 12px;
  wires: 1px, horizontal; terminal: 5px square at wire end; hot node: accent
  stroke + accent text. Caption below in mono-label style.
- **Code block** — ink ground, white text, no radius, 1px rule top and bottom
  on white sections; mono 13.5px.

## Voice

- Declarative and short. "Typed end to end." not "We help you build…".
- Display lines may break mid-phrase for composition; no exclamation marks.
- Captions and annotations in mono uppercase read like figure labels
  (`FIG 01 — TYPE FLOW`).

## Theme sync

`theme/tokens.json` carries the docs-facing subset: bg white, fg ink, accent
cobalt, muted gray. Docs pages stay white-ground; cobalt appears only as
links/accents there.
