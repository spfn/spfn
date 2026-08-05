---
title: "Your vibe-coded app works but you can't change it any more"
description: Why an app built by describing what you want gets harder to change over time, written for someone who does not read the code, and what the honest options are.
order: 3
---

## What is happening

You described what you wanted. It got built. It worked. You kept going, and somewhere
along the way asking for a change stopped being easy — the AI takes longer, breaks things
that used to work, or fixes one thing and quietly breaks another.

Nothing is corrupted and you did not do anything wrong. What happened is that the app
stopped being organised in one way.

Here is the shape of it, without the code. Imagine a filing cabinet where each new
document is filed by whoever happened to be at the desk that day. One files by date, one
by customer, one by project. Every filing is defensible. But now nobody can find
anything, and the person filing tomorrow has to guess which system to follow — so they
invent a fourth.

Your app is that cabinet. Each time the AI added a feature it made reasonable choices
about where things go, but it made them fresh each time, without knowing what it decided
last week. Engineers call the result **architecture drift**.

## Why the AI does this

Not carelessness. Two ordinary limits.

**It cannot see all of your app at once.** It reads what it needs for the task you gave
it and works from that. Something it wrote a month ago in a different part of the app is
simply not in front of it, so it writes a new version rather than reusing the old one.

**It copies whatever it happens to look at.** That is what makes it good at matching your
style. It also means that once two different arrangements exist, each new feature copies
one of them at random, and the mess grows rather than settling.

There is a third thing, and it is about you rather than the AI. When the code gets
written by a tool and you do not read it, there is no moment where anyone says "this
doesn't match the last one". It runs, so it looks fine. The bill arrives later.

## What you can actually do

**Nothing, if the app is nearly done.** Drift only costs you when you change things. An
app that works and stays as it is costs nothing. Do not let anyone talk you into rebuild
work you do not need.

**Ask for one thing at a time and check it against the last one.** When you ask for a new
feature, tell the AI to build it the same way as a specific existing feature and name
which one. This does not fix what exists, but it stops the spread, and it costs you
nothing but a sentence.

**Write the rules down where the AI reads them.** Tools like Claude Code and Cursor read
a file in your project before they start. If that file says exactly where each part of a
feature goes, the AI stops guessing. It still needs someone to notice when it is ignored.

**Start the next thing on a structure that is already fixed.** Some frameworks decide the
arrangement for you, so the AI has no choice to make. Nothing to drift.

## The honest version of the last option

That last one is what we build. SPFN fixes the arrangement — every feature is put
together the same way, in the same places, because the framework has no other place to
put it. The AI cannot invent a second arrangement because a second arrangement does not
exist.

Three things you should know before that sounds like a solution to everything.

- It stops the app being organised inconsistently. It does not stop the AI writing a rule
  wrongly. Those are different problems and only the first one is addressed here.
- It is a real constraint. If you want your app arranged some other way, this is the
  wrong tool.
- Moving an app that has already drifted onto it is work. Starting something new on it
  is not.

And one thing that is not a limitation but is worth saying plainly: if what you need is a
database and logins and you are happy assembling the rest as you go, Supabase or Firebase
will serve you well, and a lot of people should stop reading here and do that. They give
you the infrastructure. What they do not give you is a decision about where your code
goes — which is the thing this page is about.

## Related

- [Architecture drift](../architecture-drift.md) — the same thing written for someone who
  reads code.
- [Stopping Claude Code from drifting](./claude-code.md) — the file to write, and what to
  put in it.
