---
title: Compare
description: Honest comparisons between SPFN and the other ways to give a Next.js app a typed backend and real user accounts.
---

## What these pages are

Comparisons, written by the people who build SPFN, about when to use something else.

Every page here says plainly that SPFN is ours, names the alternatives it is measured
against, and states where each of them is the better choice. A page that never concedes
anything is not worth reading and we would rather not write one.

If you want to know how SPFN works rather than whether to use it, the
[documentation](./docs.md) is the place for that. If you are here because a codebase an
agent wrote has stopped holding together, that problem has its own page:
[architecture drift](./architecture-drift.md).

## Pages

- [Full-stack TypeScript frameworks in 2026](./compare/fullstack-typescript-frameworks.md)
  — Next.js, Wasp, TanStack Start, NestJS and SPFN, for someone who wants typed
  end-to-end APIs and real accounts without learning a new language.
- [Next.js authentication after sign-in](./compare/nextjs-auth-after-sign-in.md) — building
  it yourself, having an agent write it, wiring Better Auth, or installing `@spfn/auth`,
  compared by what each one leaves you holding.
- [Adding a capability to a backend](./compare/adding-a-capability-to-a-nextjs-backend.md)
  — NestJS modules, tRPC routers and SPFN packages, measured by what arrives with the unit
  of composition and what stays your job.
- [Error tracking without another service](./compare/error-tracking-without-another-service.md)
  — hosted Sentry, self-hosted Sentry, GlitchTip and `@spfn/monitor`, compared by what you
  have to run and where the error data lives.
- [File uploads in Next.js](./compare/file-uploads-presigned-urls.md) — writing presigned
  URLs by hand, a hosted service, or `@spfn/storage` over your own bucket, compared by who
  answers the three warnings every tutorial ends with.
