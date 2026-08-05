#!/bin/sh
# Daily adoption-metrics run for launchd (com.spfn.adoption-metrics, 18:00 KST):
# append today's row and commit it to this branch. snapshot.mjs itself skips
# when today's row already exists, so a manual run earlier the same day is safe.
set -eu
cd "$(dirname "$0")/../.."
node scripts/adoption-metrics/snapshot.mjs
if ! git diff --quiet -- scripts/adoption-metrics/snapshots.jsonl
then
    git add scripts/adoption-metrics/snapshots.jsonl
    git commit -m "chore(metrics): $(date +%Y-%m-%d) 채택 지표 행을 기록한다"
    git push origin HEAD || echo "push failed; row committed locally"
fi
