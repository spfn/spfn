# Contributing to SPFN

Thanks for considering a contribution. SPFN is a TypeScript monorepo (pnpm +
Turborepo); this page is the human front door. The machine-readable rules that AI
agents follow live in **[AGENTS.md](./AGENTS.md)** — if you work with an agent, point
it there.

By participating you agree to our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Quick start

Requires Node ≥ 18.18 and pnpm (the pinned version is in `package.json` →
`packageManager`).

```bash
git clone <your fork>
cd spfn
pnpm install
pnpm build        # build all packages
pnpm test         # run the test suite (vitest)
```

Most work happens inside a single package (`packages/<name>/`) or example
(`examples/<name>/`). See that package's `README.md` — they are the authoritative,
up-to-date docs for each package.

## The development loop

1. Branch from `main`: `git checkout -b feat/short-description`.
2. Make a focused change. Follow the **SPFN pattern** and **code style** described in
   [AGENTS.md](./AGENTS.md).
3. If you changed routes, run `pnpm codegen` and commit the regenerated output.
   If you changed a Drizzle schema, run `pnpm db:generate` for the migration.
4. Make sure `pnpm build`, `pnpm test`, and `pnpm lint` pass.
5. Open a PR against `main` and fill in the template.

Integration tests need PostgreSQL and Redis on your own machine — start them with
`./scripts/test-services.sh start` from the repo root.

## Pull requests

- **One concern per PR.** Small, single-purpose diffs get reviewed and merged faster.
- **CI must be green.** Build, tests, and lint run on every PR regardless of how the
  code was written.
- **Conventional Commits** for titles and commits: `type(scope): subject`
  (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`; `!` marks a breaking change).
- Update the relevant package `README.md` when you change public behavior — those
  READMEs are the source of truth, including for AI agents.

## Working with AI agents

Most contributors will use AI assistance, and that's welcome. Two expectations:

- **You own what you submit.** Whether you typed it or an agent generated it, you are
  responsible for the code: you must understand it, and it must pass every check. We
  review the diff, not the process — you don't need to disclose AI use.
- **Let the agent read the rules.** [AGENTS.md](./AGENTS.md) is written for agents and
  is wired into `CLAUDE.md`. Pointing your tool at the repo root is enough.

## DCO

Contributions are accepted under the [Developer Certificate of Origin](https://developercertificate.org/)
(DCO). It is a lightweight statement that you wrote the contribution or otherwise have
the right to submit it under the project's license. Certify it by signing off each
commit:

```bash
git commit -s -m "feat(core): add ..."
```

This appends a line to the commit message:

```
Signed-off-by: Your Name <you@example.com>
```

The name and email must be real and match your Git identity. PRs whose commits are not
signed off cannot be merged. If you forget, `git commit --amend -s` (or an interactive
rebase for multiple commits) fixes it.

## Security

Do not open public issues for vulnerabilities — see [SECURITY.md](./SECURITY.md) for
private disclosure.

## License

By contributing, you agree your contributions are licensed under the repository's
[MIT License](./LICENSE).
