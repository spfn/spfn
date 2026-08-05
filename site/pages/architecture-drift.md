---
title: "Architecture drift: why an AI coding agent builds the same feature two different ways"
description: What architecture drift is, why coding agents accelerate it, and why fixing the shape of a feature is a different answer from detecting the drift after it happens.
---

## What architecture drift is

Architecture drift is the gap that opens between the structure a codebase was supposed to
have and the structure it actually has. It is not a bug. Every commit works. The problem
is that the commits do not agree with each other.

You can see it without reading much code. One feature stores data through a repository
class. The next talks to the database directly from a route handler. A third builds
queries inline with the ORM. Each was a reasonable local decision. Together they mean
there is no answer to "where does data access live in this project", and every new
feature has to re-decide.

The term is not settled yet, and you will meet the same thing under other names.
Semantic duplication is one — the same logic reimplemented under a different name because
nobody knew the first one existed. AI patchwork is another. Thoughtworks' technology
radar files it under architecture drift and pairs it with LLMs directly, which is the
naming this page follows.

## Why coding agents make it worse

Drift predates AI. Teams have always accumulated it through turnover, deadlines and
half-finished migrations. Three things change when an agent is writing the code.

**The agent solves your prompt, not your codebase.** It reads what it needs for the task
in front of it. A helper that already exists three directories away is invisible unless
something puts it in context, so the agent writes a second one. This is the mechanism
behind duplicated logic under different names — not carelessness, just a context window
that ends.

**The agent copies what it sees, including the mistakes.** Pattern matching is what makes
these tools good. It also means that once two shapes exist in a codebase, the next
feature is generated from whichever one the agent happened to read, and the inconsistency
reproduces itself. Drift compounds rather than accumulating linearly.

**Volume outruns review.** An agent produces more code in an afternoon than a careful
reviewer reads in one. When the person directing it has never built a backend — which
describes a large share of the people building this way — there is no basis on which to
reject a shape at all. The code runs, the feature works, and the only signal that
something is wrong arrives months later when a change becomes impossible.

## The usual answers, and what they have in common

Ask how to prevent it and you get a consistent list:

- Write architecture decision records so the intent is in the repository.
- Add fitness functions to CI that fail the build when layering rules are violated.
- Put constraints in documentation and diagrams the agent is told to consult.
- Standardise prompts so they carry the intended design.
- Schedule periodic reviews and refactors to pull the codebase back into line.

None of these is wrong. Every one of them is worth doing on a large system. But notice
what they share: each assumes the wrong shape gets written, and works to catch it
afterwards. They are detection and enforcement.

That position has a running cost. The rules live separately from the code, so they have
to be maintained separately. They are checked after generation, so every feature pays for
a produce-reject-retry loop. And they only catch what someone thought to encode — the
first time an agent invents a shape nobody anticipated, the check passes.

## The other answer: leave nothing to decide

There is a second way to approach it, and it is structural rather than procedural. If a
feature has exactly one shape, an agent cannot pick a different one.

Not "should have one shape by convention". One shape, in the sense that the file the
entity goes in, the file the repository goes in, the file the route goes in and the line
that registers it are all determined by the framework rather than by whoever is writing
today. The question "how should this feature be organised" never reaches the agent,
because it was answered before the agent was asked anything.

This is what SPFN does, and it is our framework, so read the rest of this section knowing
that. Every feature is a vertical slice with the same four parts in the same four
places — entity, repository, route, router registration — and the shape is written down
in an `AGENTS.md` the agent reads before it starts. The human's job is to point at it.
The claim is not that the person understands the architecture. It is that they do not
have to.

## What this does not solve

A fixed shape constrains where things go. It does not make what is inside them correct.

- **Business logic still drifts.** Two services can implement the same rule differently
  even when both live exactly where they belong. Nothing here catches that.
- **The constraint is real.** If your application genuinely needs a different structure
  than the one the framework fixes, a fixed structure is a cost and not a benefit. This
  suits products assembled from ordinary CRUD-shaped features, which is most products,
  but not all of them.
- **Review does not go away.** One class of review does — the class that asks "is this
  put together the same way as the last one". Correctness review remains.
- **It applies going forward.** A codebase that has already drifted has to be brought
  onto the shape before the shape can hold it.

Architecture decision records and CI checks remain useful next to this, and they answer
questions a framework does not: which external service to call, what a business rule is,
which module may depend on which. Fixing the shape removes one source of drift. It does
not remove the others.

## Where a backend-as-a-service sits

If you have built a frontend and need a server, the answer you are usually given is
Supabase or Firebase, and for many products that answer is correct. A managed PostgreSQL
with authentication attached solves real problems on day one, and nothing on this page
argues otherwise.

It is worth being clear about what it does and does not address. A backend-as-a-service
gives you a database and an authentication system. It does not give your application a
shape. The code your agent writes around it — the route that validates the request, the
place the query lives, how errors come back, where the permission check happens — is
still generated fresh each time, and drifts exactly as it would have without it.

The two are not alternatives in the way a comparison table suggests. One supplies
infrastructure; the other decides where code goes.

## If you want to look further

Three pages take this from a different starting point, depending on where you are:

- [Stopping Claude Code building the same feature two ways](./architecture-drift/claude-code.md)
  — what to put in `AGENTS.md`, and why an instruction nothing checks only goes so far.
- [The backend your agent wrote is hard to change](./architecture-drift/ai-coding-agent.md)
  — how to tell unfamiliar from inconsistent, and the four options once you know.
- [Your vibe-coded app works but you can't change it](./architecture-drift/vibe-coding.md)
  — the same problem without the code, for someone who does not read it.

And the surrounding material:

- [Full-stack TypeScript frameworks compared](./compare/fullstack-typescript-frameworks.md)
  — where SPFN sits against Next.js alone, Wasp, TanStack Start and NestJS, including
  when one of those is the better call.
- [Docs](./docs.md) — the vertical slice in full, with the code.
