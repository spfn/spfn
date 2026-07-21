---
title: Packages
description: The @spfn/* package family — take what you need.
---

## Take what you need

SPFN ships as composable packages, not a monolith. `@spfn/core` is the only
required piece; everything else is opt-in. Deep documentation lives in each
package's README — those are the source of truth, maintained alongside the
code. Package docs will be served here directly once repo doc mounting ships;
until then the links go to GitHub.

## Framework

| Package | What it does |
| ------- | ------------ |
| [`@spfn/core`](https://github.com/spfn/spfn/tree/main/packages/core#readme) | Server, routing, database, codegen — the kernel every app uses |
| [`spfn` (CLI)](https://github.com/spfn/spfn/tree/main/packages/cli#readme) | `create`, `init`, `codegen`, dev workflow |
| [`@spfn/migrate`](https://github.com/spfn/spfn/tree/main/packages/migrate#readme) | Database migration tooling |

## Batteries

| Package | What it does |
| ------- | ------------ |
| [`@spfn/auth`](https://github.com/spfn/spfn/tree/main/packages/auth#readme) | Sessions, OAuth providers, RBAC, invitations |
| [`@spfn/storage`](https://github.com/spfn/spfn/tree/main/packages/storage#readme) | File uploads — local and GCS drivers |
| [`@spfn/notification`](https://github.com/spfn/spfn/tree/main/packages/notification#readme) | Email and messaging with pluggable providers |
| [`@spfn/monitor`](https://github.com/spfn/spfn/tree/main/packages/monitor#readme) | Health checks, metrics, request tracing |
| [`@spfn/cms`](https://github.com/spfn/spfn/tree/main/packages/cms#readme) | Content models and admin endpoints |
| [`@spfn/workflow`](https://github.com/spfn/spfn/tree/main/packages/workflow#readme) | Background jobs and step workflows |

## Serving

| Package | What it does |
| ------- | ------------ |
| [`@spfn/pages`](https://github.com/spfn/spfn/tree/main/packages/pages#readme) | Serve a website from a repo — this site runs on it |
| [`@spfn/pages-next`](https://github.com/spfn/spfn/tree/main/packages/pages-next#readme) | Next.js integration: layouts, catch-all helpers, static export sync |

## Versioning

Everything is beta (`0.x.y-beta.N`). APIs can move between betas; release
notes will land on this site when they start shipping.
