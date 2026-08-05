---
title: "Error tracking without another service: Sentry, GlitchTip and @spfn/monitor"
description: Every way of finding out that production broke, compared by what you have to run to get it — a SaaS account, a self-hosted stack, or a schema in the database you already have.
order: 4
---

## The question

A deployed product fails in ways local development never showed you. Finding out is not
optional, so the only real question is what you are willing to run to find out.

Four answers, and they differ almost entirely on that one axis.

**SPFN is ours.** `@spfn/monitor` is the last one compared. The others are described from
their own documentation, and for most readers the first one is the right answer.

## Sentry, hosted

The default, and it is the default for good reasons. Source maps, release health, tracing,
session replay, alert rules, issue assignment, SDKs for everything, and a free tier that
covers most early-stage products without a card.

The cost is not money at that scale. It is that your users' error payloads — request
context, sometimes their data — leave your infrastructure and live in someone else's
account. For plenty of products that is a non-issue. For some it is the whole
conversation, and those are the readers the rest of this page is for.

## Sentry, self-hosted

Sentry publishes its own self-hosted distribution, so this is a supported path rather than
a hack.

Its documented minimum is **4 CPU cores, 16 GB of RAM plus 16 GB of swap, and 20 GB of
free disk**, with 32 GB of RAM recommended. The stack behind that number is large — the
documentation's own list of services includes Kafka, ClickHouse, PostgreSQL, pgbouncer,
Redis, memcached, Snuba, Symbolicator, Relay, SeaweedFS, nginx, a web tier, workers and a
task broker.

You get the whole product. You also get a distributed system to operate, and it is a real
one.

## GlitchTip

The light end of self-hosting, and a genuinely reasonable choice rather than a straw man.

Its documented requirements are PostgreSQL 14 or newer and a single service, which can be
split into separate web and worker services to scale. Valkey or Redis 7+ is optional but
recommended. The stated minimum is **256 MB of RAM** for the all-in-one setup, 512 MB
recommended, and it deploys by Docker Compose or by Kubernetes with Helm charts.

If what you want is an error tracker that is yours and is small, this is a good answer and
you should weigh it seriously against the one below.

What it still is: a separate deployment, with its own database, its own process, its own
upgrades and its own backups.

## @spfn/monitor

Not a service. A schema.

`@spfn/monitor` creates the PostgreSQL schema `spfn_monitor` with three tables —
`error_groups`, `error_events` and `logs` — in the database the app already uses, and
ships pre-generated migrations so adopting it does not mean writing schema. Wiring is
three declarations:

```ts
export default defineServerConfig()
    .middleware({ onError: createMonitorErrorHandler() })
    .lifecycle(createMonitorLifecycle())
    .routes(appRouter)
    .build();

export const appRouter = defineRouter({ /* ... */ })
    .packages([authRouter, monitorRouter]);   // serves /_monitor/admin/*
```

There is no new process, no broker, no second datastore and no separate backup.

**Deduplication is a state machine, not a counter.** The fingerprint is
`SHA-256(name:message:path)` truncated to 16 hex characters, so one broken route is one
group rather than ten thousand rows. A new fingerprint creates a group and notifies Slack.
An error already `active` or `ignored` increments the count and stays quiet. A `resolved`
group reopens and notifies again. The point of the quiet middle case is that a Slack
channel which fires on every occurrence stops being read by Wednesday.

**The dashboard is the one you do not build.** `@spfn/monitor/nextjs/client` exports React
components — `MonitorDashboard` takes no props and renders stats, an errors tab, a logs
tab and drill-down. The admin routes behind them are superadmin-only. This is generic
enough to ship; operating on your own business data is a different job and belongs to
[`@spfn/mcp`](../docs/packages/mcp.md).

## What @spfn/monitor does not do

Longer than the feature list, deliberately.

- **It is not an APM.** No tracing, no release health, no session replay, no performance
  monitoring, no source-map resolution. Sentry is a different category of product and this
  page is not pretending otherwise.
- **It sees server errors only.** The hook is the server's `onError`, so a JavaScript
  exception in the browser never reaches it.
- **It only tracks what throws at or above status 500** by default. A 4xx that returns
  normally is not an error here. The threshold is configurable.
- **Retention is not automatic.** The retention settings are values the getters read;
  nothing deletes old rows on its own. You schedule the purge, and if you forget, the
  tables grow.
- **The fingerprint includes the path**, so the same error on two routes becomes two
  groups, and a path with an embedded id fragments a group per id unless you normalise it
  first.
- **It only runs inside an SPFN app.**

## Side by side

| | Sentry hosted | Sentry self-hosted | GlitchTip | @spfn/monitor |
|---|---|---|---|---|
| What you run | nothing | 4 cores, 16 GB + 16 GB swap | 256 MB, PostgreSQL + a service | nothing new |
| Where error data lives | Sentry's account | your servers | your servers | your app's database |
| Separate datastore | — | Kafka, ClickHouse, Postgres, Redis | its own PostgreSQL | no, a schema |
| Dashboard | theirs | theirs | theirs | components you mount |
| Tracing, replay, source maps | yes | yes | partial | no |
| Browser errors | yes | yes | yes | no |
| Retention | managed | managed | managed | you schedule it |

## The summary

If error data leaving your infrastructure is acceptable, use hosted Sentry. It is better
at this than anything here, and the free tier is generous.

If it is not acceptable, the question becomes how much you want to operate. Self-hosted
Sentry gives you the whole product and a distributed system to run. GlitchTip gives you
most of the job in a very small deployment. `@spfn/monitor` gives you less of the product
than either, and asks you to run nothing at all, because it is three tables in a database
you were already backing up.

That is the entire trade. It is a good one only if your reason for looking was that you
did not want another service.

- [Adding a capability to a backend](./adding-a-capability-to-a-nextjs-backend.md) — why
  a capability can ship its own tables here
- [@spfn/monitor documentation](../docs/packages/monitor.md)
