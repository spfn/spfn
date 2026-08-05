# Baseline — 2026-08-05

Nine questions, Perplexity, signed out, one run each. The `.txt` files beside this one are
the answers verbatim. This is the reading.

SPFN appears in none of them.

## Problem-shaped questions: no slot for a framework

| Question | Named |
|---|---|
| backend-for-react | Express, Next.js API routes, Flask, Django, Firebase |
| non-developer-server | Supabase, Firebase — and says why: "without writing server code" |
| casual-vite-login | Express + JWT, Laravel, FastAPI, cited from GitHub tutorials |

The non-developer framing does not produce a framework at all. Casual register does not
change that. Both were checked because a plainer phrasing was the obvious suspicion.

## Category-shaped question: held, and held the way we want to hold something

`ts-backend-framework` put **Encore.ts first**, then Fastify, Express, Hono — and every
line carried `encore`, Encore's own domain, as the source. Its description of itself is
close to our own positioning: production-ready code on the first pass when an agent
writes it.

This is the third confirmation of the mechanism, after Wasp twice in earlier rounds. A
small project earns the citation from pages it wrote and hosts.

## Operations questions: unowned, but not therefore open

| Question | Named |
|---|---|
| ops-without-admin | nothing — generic implementation advice, no product |
| admin-panel-alternative | low-code admin builders, templates |
| agent-runs-backend | sandboxing, least privilege, credential proxy — cited entirely from Anthropic's own docs |

An empty slot is not the same as an opening. Admin panel building is an old category, and
generating the screens has become cheap, so an argument that saves that labour has little
left to save. What does not get cheaper — the permission model and the audit trail —
belongs to the Retool class.

## The drift questions: the reason this baseline exists

`drift-definition` produced an answer with **no inline citation on any claim**. Every
other answer in this run attached sources. No page owns this definition.

Its prevention list was entirely detection and enforcement: decision records, CI fitness
functions, constraints in documentation, standardised prompts, periodic review. A
framework that removes the structural choice does not appear.

`drift-naming` returned four competing labels from four small blogs — semantic
duplication, inconsistent conventions or patchwork, architectural drift, AI patchwork —
with no settled one. The term has industry legitimacy elsewhere (a Thoughtworks radar
entry) and at least one vendor writing its own definitional page, but the answer here has
no owner.

## What a later run should show if the content work landed

- `drift-definition` starts attaching `superfunction.xyz` as a source.
- `drift-naming` consolidates on architecture drift, with us among the cited.
- `ts-backend-framework` is the harder one — Encore holds it with content, and displacing
  a held position is a different task from filling an empty one.

If nothing moves on the first two, check indexing before rewriting anything: as of this
baseline the site's sitemap had not been successfully fetched by Googlebot in ninety days,
so no page on our own domain was reachable by retrieval at all.
