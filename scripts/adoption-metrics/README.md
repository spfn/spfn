# Adoption metrics

One command answers "did adoption move since the last review". It fetches every
external adoption signal the project tracks, appends a dated row to
`snapshots.jsonl` (committed, append-only), and prints the latest row against the
previous one.

```bash
node scripts/adoption-metrics/snapshot.mjs            # fetch, append, show
node scripts/adoption-metrics/snapshot.mjs --dry      # fetch and show, no append
node scripts/adoption-metrics/snapshot.mjs --view     # show the record only
```

## What it reads

| Signal | Source | Notes |
|---|---|---|
| Stars, forks, watchers | api.github.com/repos/fxylabs/spfn | unauthenticated |
| External issues / PRs | same, `author_association` + an explicit internal-account list | the maintainer's personal account is only CONTRIBUTOR, so association alone cannot exclude it |
| npm weekly downloads | api.npmjs.org, every non-private `packages/*` | secondary signal — includes our own CI |

## What it cannot fetch

PostHog LLM referrals and Search Console numbers need credentials; the citation
probe (`scripts/citation-probe`) runs on its own cadence. Enter them by hand when
known:

```bash
node scripts/adoption-metrics/snapshot.mjs \
    --posthog 12 --gsc-impressions 340 --gsc-clicks 9 --probe not-cited
```

Omitted fields are recorded as null and shown as `—`.

## Rules

- The record is append-only. A bad row is corrected by appending a new row.
- Cadence is weekly, run at review time. Every review ends in a recorded
  decision — a strategy adjustment or an explicit "no change" — otherwise this
  is a dashboard, not monitoring.
- The 2026-08-05 row is the baseline the 2026-12-31 objective is measured
  against (stars 3, forks 0, external issues 0, external PRs 0).
