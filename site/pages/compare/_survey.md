---
title: Comparison topic survey
draft: true
---

## Purpose

Working notes, not a published page. Records which `@spfn/*` packages have a real
comparison to write, who the named target is, and which one goes first. Drafted
2026-08-05 on `docs/compare-content-survey`.

## Why package-level pages, not more framework-level ones

w-kj8xm measured what assistants answer when someone asks how to take a Next.js
prototype to production. The answer is always a list of vendors to assemble: Clerk,
Supabase, Neon, Drizzle, Zod, S3, Cloudflare R2, Stripe, Sentry, Upstash, Vercel.

Read that list again from our side. Every slot in it is a category one of our packages
competes in. At framework level SPFN is invisible and unranked. At package level the
comparison is like for like, and models already name specific packages when answering —
which is the granularity they actually reason at.

So the second asset should be a package comparison, and the survey below picks which.

## What each package is, and whether it has a target

| Package | Category | Named alternatives a buyer weighs | Target clear? |
|---|---|---|---|
| auth | authentication | Better Auth, Auth.js, Clerk, WorkOS, Supabase Auth, Keycloak | yes, crowded |
| monitor | error tracking | Sentry, GlitchTip, Temps, Uptrace, SigNoz | yes |
| storage | file upload | S3 presigned-URL recipes, Supabase Storage | weak field |
| workflow | background jobs | Inngest, Trigger.dev, BullMQ, Temporal, Vercel Queues, QStash | yes, well funded |
| notification | outbound messages | (not measured yet) | unknown |
| cms | content | (not measured yet) | unknown |
| i18n | translations | (not measured yet) | unknown |
| mcp | agent operations | managed MCP servers from cloud vendors | category collides |
| migrate | data migrations | unusual — data, not schema | no clear field |
| pages / pages-next | markdown sites | (not measured yet) | unknown |
| core | backend runtime | already covered by the framework page | — |
| cli | scaffolding | not a topic on its own | — |

## The pattern that runs through the measured fields

Search the self-hosted end of three of these categories and the same shape appears.

- **Error tracking.** Every self-hosted Sentry alternative is another service to run.
  Self-hosting Sentry itself wants Kafka, Redis, PostgreSQL, ClickHouse and Snuba, around
  8GB of RAM. GlitchTip, Temps, Uptrace and SigNoz are lighter but each is still a
  deployment you own and operate.
- **Background jobs.** BullMQ means running Redis and persistent workers yourself.
  Inngest, Trigger.dev and Temporal are services.
- **File upload.** The category is not products at all — it is blog posts teaching you to
  write presigned-URL code, with the warnings about expiry, content-type spoofing and CORS
  spread across them.

The unclaimed slot in all three is the same: **no additional service, because it lives in
the database and the router the app already has.** That is the vertical-slice argument
from the framework page, stated one package at a time.

## Ranking

**1. @spfn/auth against Better Auth — revised to first place.**

The initial ranking put auth third on the grounds that Better Auth had taken the slot we
would claim. That reading was too shallow. Better Auth wins the *sign-in* comparison and
it is not close. But signing someone in is where the work starts, and the rest of it is a
different comparison entirely.

Three chapters, each verified on both sides.

*Chapter one — what happens to every request after login.* Better Auth's answer for
non-browser clients is the Bearer plugin: the session token travels in an `Authorization`
header, and its own documentation attaches a caution that improper implementation can
easily lead to vulnerabilities. It documents no request signing, no per-device keys, no
nonce and no replay protection. `@spfn/auth` ships a signed-request profile instead —
ECDSA P-256 over a canonicalised body, a nonce with a replay window, a fixed admission
order (revoked, session, expired, replayed, signature) and a fixed error envelope clients
classify by code rather than HTTP status. Every operation in that contract is POST with
its arguments in the body, deliberately, because a GET has no body to sign and a path
value has no canonicalisation rule — client and server could disagree over
percent-encoding or a proxy rewrite and the request would be refused with nothing in the
logs naming why.

*Chapter two — deletion.* Apple and Google require an app that creates accounts to let a
user delete one from inside the app. Taking the request and never processing it is the
failure mode, and it is common. Better Auth's deletion is a hard delete, immediate, off by
default, with verification options and before/after hooks. `@spfn/auth` ships the state
machine: a 30-day grace period by default, sessions revoked at request time, login refused
with a dedicated error carrying the scheduled purge date so the client can offer recovery,
cancel-and-recover, an anonymise or hard-delete purge strategy, a daily sweep registered
through `authJobRouter`, an audit row whose foreign key is deliberately `set null` so the
record outlives the user row, and a purge that re-verifies on the write primary inside the
destructive transaction so a concurrent cancel cannot be raced.

*Chapter three — keys.* Per-device, accumulating on purpose, with list and revoke so the
owner can cut off a device they no longer recognise. Expiry is computed at request time
rather than stored, because a list that showed an expired key as active would report
something the server does not act on.

**The argument that ties them together, and it is the user's phrasing:** every one of
those is a decision somebody has to design, argue, settle, test and measure. Not having to
is the product.

**What the page must concede, plainly.** Better Auth is framework-agnostic and works
anywhere; `@spfn/auth` only works inside an SPFN app, which disqualifies it for most
readers before any other argument. Better Auth's plugin range is wider — passkeys,
multi-tenancy, enterprise SSO, 2FA — and it is the recommended default for new
self-hosted Next.js projects for good reasons. And our own signed-request profile has a
stated limit: public keys are registered at construction or through a control hook with no
persistence, and production enrollment and rotation are phase two. A page that hides that
line deserves to lose the reader it wins.

**2. @spfn/monitor against Sentry and the self-hosted alternatives.**

The target is single and famous, and the field's common weakness is verifiable rather than
rhetorical: every alternative is a separate deployment. `@spfn/monitor` writes errors to
the app's own PostgreSQL, ships its own migrations, deduplicates by fingerprint, pushes to
Slack on state change, and brings dashboard components so this is the one dashboard you do
not build. It mounts with `.packages([monitorRouter])` like every other slice.

Honest concessions the page must carry: Sentry's tracing, release health, session replay
and source-map handling are far beyond this, and a team that already pays for Sentry has
no reason to move.

**3. @spfn/storage against writing presigned uploads yourself.**

The weakest field measured, which makes it the easiest entry. The category is currently
tutorials, and every tutorial hands the reader a checklist of ways to get it wrong. A
maintained package that already handles them has a straightforward argument.

Lower search demand than auth, and the honest concession is that a presigned upload is not
hard to write once — the cost is maintaining it.

**3. @spfn/auth against Better Auth.**

The largest field by demand and the reason the recorded positioning names accounts as the
first gate. But the slot we would have claimed is taken: Better Auth is now the
recommended default for new self-hosted Next.js projects, and its pitch is the one we
would have used — sessions in your database, on your infrastructure, configured in code.

The page is still writable, on a different axis. Better Auth is a library you wire into an
app; `@spfn/auth` is a slice you mount, arriving with its routes, its typed client, its
tables and its migrations, alongside the other slices that already share those types. That
difference is real and checkable. It is a narrower claim than "self-hosted" and it must be
made narrowly.

**4. @spfn/workflow.** Well-funded competitors, several of them. Later.

**Not yet rankable:** notification, cms, i18n, pages. Their fields were not measured. Do
that before writing rather than guessing at the alternatives.

**@spfn/mcp stays inside other pages.** w-kj8xm round 1 found that the standalone question
lands in enterprise data governance, among managed MCP servers from Google Cloud,
CockroachDB and Oracle. It is a feature line elsewhere, not a page.

## Method note

Alternatives were read from ordinary web search on 2026-08-05, one query per category.
Nothing here is verified against a competitor's own documentation yet; the framework page
showed how badly that can go, so each claim about a named alternative gets checked against
its official docs before it is published.
