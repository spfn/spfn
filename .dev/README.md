# Development Documentation

This directory contains documentation for tracking the development process of SPFN.

## 🎯 Purpose

- **Track development history** - Record what we built and why
- **Document decisions** - Architecture Decision Records (ADR)
- **Share knowledge** - Team learning and insights
- **Onboard contributors** - Help new team members understand the project

## 📂 Directory Structure

### `status/`
Development status snapshots and progress tracking.

- `current.md` - Current development status (updated continuously)
- `YYYY-MM.md` - Monthly snapshots (created at milestones/releases)

### `decisions/`
Architecture Decision Records (ADR) documenting important technical decisions.

Format: `NNN-decision-title.md`

Example:
- `001-file-based-routing.md` - Why we chose Next.js-style routing
- `002-transaction-management.md` - Why AsyncLocalStorage for transactions
- `003-client-key-auth.md` - Why ECDSA P-256 for authentication

### `experiments/`
Research and proof-of-concept documentation.

- Feature explorations
- Technology evaluations
- Performance tests
- Integration experiments

### `benchmarks/`
Performance benchmark results and analysis.

- Load testing results
- Query performance
- Memory profiling
- Comparison with other frameworks

## 📝 Document Templates

### ADR Template

```markdown
# NNN. [Decision Title]

**Date:** YYYY-MM-DD
**Status:** Accepted | Rejected | Deprecated | Superseded
**Deciders:** Name(s)

## Context
What is the issue we're trying to solve?

## Decision
What did we decide to do?

## Consequences
What are the trade-offs?

### Positive
- Benefit 1
- Benefit 2

### Negative
- Drawback 1
- Drawback 2

## Alternatives Considered
1. Alternative 1 - Why rejected
2. Alternative 2 - Why rejected

## References
- Link 1
- Link 2
```

### Status Update Template

```markdown
# Development Status - YYYY-MM-DD

## Completed
- [x] Feature 1
- [x] Feature 2

## In Progress
- [ ] Feature 3 (70% complete)
- [ ] Feature 4 (30% complete)

## Blocked
- [ ] Feature 5 - Waiting for X

## Next Steps
1. Complete Feature 3
2. Start Feature 6
3. Review Feature 7

## Metrics
- Tests: XXX passing
- Coverage: XX%
- Build time: XXs
```

## 🔄 Update Frequency

- **`status/current.md`** - Update weekly or after significant milestones
- **`decisions/`** - Create when making important architectural decisions
- **`experiments/`** - Document as experiments are conducted
- **`benchmarks/`** - Update when performance testing is done

## 👥 Who Should Contribute

- **Core team** - Primary documentation responsibility
- **Contributors** - Document significant contributions
- **Maintainers** - Review and ensure consistency

## 📚 Relationship to Public Docs

```
.dev/          → Development process (Git committed, internal focus)
docs/          → User documentation (Git committed, public facing)
packages/*/    → Package-specific technical docs (Git committed)
```

## 🔗 Quick Links

- [Current Status](./status/current.md)
- [Project Roadmap](../docs/project/roadmap.md)
- [Contributing Guide](../CONTRIBUTING.md)

---

**This is an internal development directory. All contents are committed to Git to preserve development history.**