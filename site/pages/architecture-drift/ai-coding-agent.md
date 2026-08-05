---
title: "The backend your AI coding agent wrote has become hard to change. What now?"
description: How to tell whether an agent-written backend is merely unfamiliar or actually inconsistent, and what the options are once you know which.
order: 2
---

## Start by telling apart two different problems

A backend you did not write by hand is unfamiliar. That is not the same as broken, and
the two feel identical from the outside. Before deciding what to do, work out which one
you have, because the answers are opposite.

Open three features that do roughly similar things — say, three endpoints that read and
write a table each — and compare them structurally. Not the business logic. The shape.

| Question | If the answer is the same for all three | If it differs |
|---|---|---|
| Where does the database call happen? | unfamiliar, not inconsistent | inconsistent |
| Where does input validation happen? | | |
| How does an error reach the client? | | |
| Where does the permission check live? | | |

Consistent but unfamiliar is a documentation problem. Read one feature carefully, write
down what you find, and the rest becomes legible. Do not restructure anything.

Different answers across the three is [architecture drift](../architecture-drift.md), and
it is the case this page is about.

## Why an agent produces this

Three mechanisms, none of which is the agent being careless.

**It answers your prompt, not your codebase.** Context is finite, so the helper that
already exists in another directory is invisible unless something puts it in front of the
agent. It writes a second one. This is why duplicated logic under different names is the
most common symptom.

**It copies what it can see, including inconsistency.** Pattern matching on your existing
code is what makes these tools useful. Once two shapes exist, each new feature is
generated from whichever one got read, and the split reproduces itself rather than
converging.

**It produces faster than review absorbs.** The rate at which structural decisions get
made goes up by an order of magnitude, and the rate at which they get checked does not.

Note that none of this is specific to one tool. Claude Code, Cursor and Copilot differ in
interface and context handling, not in this.

## What the options actually are

**Do nothing, deliberately.** If the application is small and close to finished, drift
costs nothing. This is a real answer and it is often the right one — the cost of drift is
paid at change time, so an application that stops changing never pays it.

**Add checks around what exists.** Architecture decision records, lint rules and CI
checks that fail the build on layering violations. This keeps your current structure and
stops it degrading further. The cost is ongoing: the rules live apart from the code, need
maintaining, and only catch what you thought to encode.

**Standardise the instructions the agent reads.** An `AGENTS.md` naming the exact files a
feature consists of removes the ambiguity the agent would otherwise resolve by guessing.
Cheap, immediate, and limited by the fact that nothing enforces it —
[the detail is here](./claude-code.md).

**Move onto a fixed shape.** Adopt a framework where the structure is not a choice: one
place for an entity, one for a repository, one for a route, one registration. Nothing to
drift from. The cost is real — it is a migration, and it is a constraint you keep.

## Choosing between them

| Situation | Reasonable answer |
|---|---|
| App is nearly done, changes are rare | do nothing |
| Structure is fine, you want to hold it | checks in CI |
| Structure is fine, agent keeps guessing | AGENTS.md |
| Three features, three shapes, and more coming | fixed shape |
| You cannot evaluate backend code yourself | fixed shape |

The last row is the one people skip. If you built the frontend and the agent built the
server, you have no basis on which to reject a structure — it runs, so it looks correct.
Checks and instructions both assume a reviewer who can tell good from bad. A fixed shape
does not.

## Where we come in

SPFN is a framework of the last kind, and it is ours. Every feature is one vertical slice
in the same four places, so structural drift is not something the agent can produce.

The honest scope: it removes drift that comes from structural choice, not drift inside
business logic, and a fixed structure is a cost if your application genuinely needs a
different one. If any of the first three answers above fits your situation, take that one
instead.

## Related

- [Architecture drift](../architecture-drift.md) — the problem in full, and why the
  common answers are all detection.
- [Stopping Claude Code from drifting](./claude-code.md) — the `AGENTS.md` route in
  detail.
- [Full-stack TypeScript frameworks compared](../compare/fullstack-typescript-frameworks.md)
  — the alternatives, with the cases where they win.
