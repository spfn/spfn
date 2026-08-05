---
title: "How to stop Claude Code building the same feature two different ways"
description: An AGENTS.md tells Claude Code what shape to follow. Whether it holds depends on whether the shape is enforced by the framework or only described in prose.
order: 1
---

## The problem in one paragraph

You ask Claude Code for a feature. It builds one. Two weeks later you ask for a similar
feature and it builds something structurally different — a different place for the
database call, a different way of returning errors, a different idea of where validation
belongs. Both work. Neither is wrong on its own. But your codebase now has two answers to
the same question, and the third feature will be generated from whichever one the agent
happens to read.

That accumulation has a name — [architecture drift](../architecture-drift.md) — and this
page is about the specific thing you can do inside Claude Code.

## What `AGENTS.md` actually does

Claude Code reads `AGENTS.md` (and `CLAUDE.md`, which normally points at it) from the
project root before it starts working. Whatever is written there enters the context of
every session. That is the whole mechanism: it is a file the agent reads, not a rule the
tool enforces.

This matters for what you should expect from it. `AGENTS.md` is very good at removing
ambiguity the agent would otherwise resolve by guessing. It is not a constraint the agent
can be prevented from breaking, because nothing checks it.

So the useful question is not "what should I put in `AGENTS.md`" but "how do I make the
instructions in it verifiable".

## Instructions that hold, and instructions that do not

An instruction holds when following it is the path of least resistance and breaking it
fails visibly. Compare two versions of the same rule.

Weak, because nothing distinguishes compliance from non-compliance:

```markdown
Keep data access consistent. Prefer the repository pattern where appropriate.
```

Stronger, because it names files and the absence of the file is obvious:

```markdown
A feature is four files, always, in these four places:
  src/entities/<name>.ts        Drizzle table
  src/repositories/<name>.ts    extends BaseRepository
  src/routes/<name>.ts          route.get/post with TypeBox validation
  src/router.ts                 one defineRouter registration

Never query the database from a route. Never add a fifth place.
```

The second one works better for a reason that is easy to miss: it does not ask the agent
to exercise judgment. "Where appropriate" is a decision, and a decision made freshly each
session is a decision that will be made differently.

## Three things worth writing down

**The shape of a feature, as file paths.** Not the principle behind it. The paths.

**What not to do, explicitly.** Agents follow prohibitions well when they are concrete.
"Never query the database from a route handler" is actionable; "maintain separation of
concerns" is not.

**Where the existing examples are.** Pointing at a real feature already in the repository
gives the agent something to copy that is more precise than anything you can describe in
prose. This is also the failure mode to watch: if the example it finds has drifted, the
drift propagates.

## Why this only goes so far

Everything above is a description of a shape that lives somewhere else — in your head, in
a document — and the code is free to disagree with it. You will find out when you read
the diff, if you read the diff.

The alternative is for the shape not to be a description at all. If the framework defines
where an entity goes, where a repository goes, where a route goes and how it registers,
then `AGENTS.md` stops being a set of instructions to follow and becomes a description of
something that is already true. There is no fifth place to put a database call because
the framework does not have one.

That is what SPFN is, and it is ours, so weigh the paragraph accordingly. The claim is
narrow: it removes the class of drift that comes from structural choice. It does nothing
about two services implementing the same business rule differently, and it is a real
constraint — an application that needs a different structure is better served by a
framework that does not fix one.

## Related

- [Architecture drift](../architecture-drift.md) — the general problem, the existing
  answers, and where they fall short.
- [Full-stack TypeScript frameworks compared](../compare/fullstack-typescript-frameworks.md)
  — including when Next.js on its own, Wasp, TanStack Start or NestJS is the better call.
