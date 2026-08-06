# CLAUDE.md

The canonical instructions for AI agents in this repository live in **[AGENTS.md](./AGENTS.md)**.
This file only points there so Claude Code picks the rules up automatically — do not
duplicate guidance here.

@AGENTS.md

<!-- superself:begin v0.5.1 -->
## Project state (superself)

Project state — goals, decisions, work units, reports — is version-controlled
by the `self` CLI, outside this repository. Skip this section if the `self`
command is unavailable.

- Session start: run `self context` and treat its output as current truth.
- Write for the reader by default: answers to the person in their language,
  records — events, decisions, reports, conventions — in English, so a record
  stays readable to whoever opens it next. A project that wants it otherwise
  records its own convention.
- Substantive work attaches to a work unit: `self work add "<required outcome>"`,
  then `self work start <id>` — which is how you read a unit's brief and report
  history, and records that this session picked it up. If another session holds
  it, you are told who and since when, and never refused; judge it and proceed.
  Report progress with `self report <id> "<summary>"` after committing — HEAD is
  attached as evidence automatically.
- Done is a judgment, and the claim must carry evidence: `self work done <id>`
  closes the unit only when a report carries a commit or an artifact, or the
  done itself states one — `self work done <id> --report "<what verifiably
  happened>"`. A bare claim is refused, and declared criteria gate it.
- A record's text is immutable once confirmed, so a correction restates it:
  `--supersedes <id>` on any add verb records the new wording and carries the
  lineage. `retract` withdraws a record with nothing replacing it, and `retire`
  is for an outcome given up or moved — neither is a wording fix.
- Record decisions the user confirmed: `self decide "<text>" --why "<reason>"`.
  Use `--proposed` when the user has not confirmed. One decision per event.
- Blocked? `self work block <id> --on decision|dependency|external --why "..."`.
  Superseded or moved? `self work retire <id> --why "..." [--successor <id>]` —
  never mark it done and never leave it falsely blocked.
- Found a gap between an objective and current state? Propose the work with
  `self work propose` and its full brief; the user accepts or declines it.
- Proposed next work, or suggested continuing in the next session, and the
  user approved? Register it with `self work add` right then, with the
  context behind the proposal — an approved plan that is never registered is lost.
- Deferring work for later? Attach a scoping brief the moment you create it:
  `self report <id> --file <path>` covering scope, design anchors, and known
  pitfalls — a bare outcome line loses the context that created the work.
- A branch reaches main through a GitHub pull request: PR review and CI own
  merge control. superself owns context and the work graph, not the merge gate.
- Never hand-edit generated state files or anything under `.superself/`.

This block is the short form. The installed CLI carries the rest — what each
concept is, when to reach for it, and the order the verbs go in:

- `self help agents` — how a session drives this CLI, start to finish
- `self help context` — what `self context` renders, and why something is missing from it
- `self help records` — one entity behind every record kind, and how a record is corrected
- `self help placement` — scope, priority and exposure — how a record earns its place in context
- `self help work` — the work graph: outcomes, evidence, criteria, and proposals
- `self help goals` — long-term goals, objectives, milestones, and what reaching one takes
- `self help workspace` — the store, the projects in it, and moving it between machines

### Conventions

- OSS product positioning overhaul playbook (generalized from the SPFN GitHub/npm/site overhaul, 2026-08-05): (1) Record one canonical positioning decision first, then rewrite the root README as the reference surface carrying its anchors — subtitle, the problem, the adoption gates, cost framed in the audience's own currency. (2) Cascade to every other surface (GitHub/npm package READMEs, site prose, package landing pages): each follows the README's anchors instead of stating its own positioning, and package pages kept as stubs sourced from READMEs let one rewrite move many pages. (3) Validate candidate wording against measured search demand (Google Trends / Keyword Planner) as a proxy for LLM retrieval before committing to terms. (4) Treat the rewrite as an audit: verify every code sample against the current API — positioning rewrites reliably surface correctness rot, which briefs tend to misread as tone problems. (5) Attach one shared scoping brief to per-surface work units so the cascade stays coordinated and corrections propagate.
- A scoping brief keeps observation and inference apart. What was seen is stated as fact; what it was taken to mean is labelled an inference, carries how many times it was seen, and names the cheapest check that would kill it. A brief is written when a problem is noticed, not when it is investigated, so its causal story is a hypothesis — and a hypothesis printed in the heading anchors the next session, which has no way to tell it from the observation. Two briefs in 2026-08 did this: 25 branches recorded as probably-unshipped security work were all already in main, and an intermittent test failure recorded as full-suite-versus-standalone on one failure in three runs turned out to be cold-connection-versus-warm.
- Daily adoption-metrics snapshot runs automatically at 18:00 KST via launchd (com.spfn.adoption-metrics; runner scripts/adoption-metrics/run-daily.sh on main — PR #94 merged 2026-08-06 as e91d0e6b — appending the day's row, skipping if it exists, committing and pushing). Sessions do not run the snapshot. If a session notices an external signal moved — stars, forks, external issue/PR, LLM referrals, GSC clicks, sitemap last-read appearing — report it on the adoption objective's work graph the same day. The weekly review still ends in a recorded decision (strategy adjustment or explicit no-change).
<!-- superself:end -->
