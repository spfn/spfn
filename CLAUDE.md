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
<!-- superself:end -->
