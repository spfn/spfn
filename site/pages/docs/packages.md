---
title: Packages
order: 3
description: The @spfn/* package family — take what you need, documented right here.
---

## Take what you need

SPFN ships as composable packages, not a monolith. `@spfn/core` is the only
required piece; everything else is opt-in. Each package's documentation is
served here, straight from the repo — the same READMEs maintained alongside
the code.

## Framework

| Package | What it does |
| ------- | ------------ |
| [`@spfn/core`](../../../packages/core/README.md) | Server, routing, database, codegen — the kernel every app uses |
| [`spfn` (CLI)](../../../packages/cli/README.md) | `create`, `init`, `codegen`, dev workflow |
| [`@spfn/migrate`](../../../packages/migrate/README.md) | Transactional, code-based data migrations with a run-once ledger |
| [`@spfn/mcp`](../../../packages/mcp/README.md) | One MCP contract over OAuth Streamable HTTP or a local stdio bridge |

## Batteries

| Package | What it does |
| ------- | ------------ |
| [`@spfn/auth`](../../../packages/auth/README.md) | Sessions, OAuth providers, RBAC, invitations |
| [`@spfn/storage`](../../../packages/storage/README.md) | Object storage for S3-compatible services, GCS, and local files |
| [`@spfn/notification`](../../../packages/notification/README.md) | Email and messaging with pluggable providers |
| [`@spfn/monitor`](../../../packages/monitor/README.md) | Error tracking, persisted logs, and an admin dashboard |
| [`@spfn/cms`](../../../packages/cms/README.md) | Content models and admin endpoints |
| [`@spfn/workflow`](../../../packages/workflow/README.md) | Lightweight pipeline and step orchestration |
| [`@spfn/i18n`](../../../packages/i18n/README.md) | Translation catalogs, interpolation, fallbacks, and React context |

## Serving

| Package | What it does |
| ------- | ------------ |
| [`@spfn/pages`](../../../packages/pages/README.md) | Serve a website from a repo — this site runs on it |
| [`@spfn/pages-next`](../../../packages/pages-next/README.md) | Next.js integration: layouts, catch-all helpers, static export sync |

## Versioning

Packages currently ship as alpha or beta prereleases (`0.x.y-alpha.N` /
`0.x.y-beta.N`). APIs can move between prereleases; release notes will land on
this site when they start shipping.
