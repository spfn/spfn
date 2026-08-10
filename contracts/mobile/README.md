# Mobile contract export

`spfn-mobile-contract.json` is what the spfn-mobile Swift and Kotlin SDKs
generate their client code from. It is **generated output** — do not edit it.

| File | What it is |
|---|---|
| `spfn-mobile-contract.json` | The contract bundle the SDK codegen reads |
| `upstream-provenance.json` | The evidence spfn-mobile's validator requires before a lock may claim an upstream export |

## Versioning

The line is **0.x**: one consumer, still alpha, and a surface that has not yet
survived a full consume cycle. Under 0.x the **minor** carries breaking changes
— `0.1.0` to `0.2.0` may break you, `0.1.x` will not. `supportedRange` says so.

The filename carries no major while the line is 0.x, because under 0.x the
major would name nothing useful. Pin the digest, not the path shape.

## Operation availability

Since 0.6.1 every operation carries `since`, the contract version it first
appeared in, with optional `deprecatedIn` and `removedIn` — both absent today.
`operationAvailability` in the bundle states what they mean.

This contract's `compatibilityPolicy` is `allOrNothing`, so those fields decide
nothing here: one version passes or refuses the whole surface. They record
history, give a deprecation somewhere to be announced, and are the same shape a
`perOperation` contract reads as a verdict input.

## Regenerating

```bash
pnpm --filter @spfn/auth export:mobile-contract
```

The source is `packages/auth/src/server/client-proof/` — change the server
there and re-run the export. `contract-export.test.ts` fails when the committed
files differ from what the assembler produces, so an edited bundle never ships.

## What is derived and what is declared

Operations, wire headers, proof-input fields, the replay window and HTTP
statuses are read from the modules that implement them: changing the server
changes the export.

The `core.time` prerequisite is imported from `@spfn/core` as well: its route
identity, transport, admission policy, and response schema are not restated in
auth. The exported `clockSynchronization` section defines the process-first,
fail-closed client policy and the four strict proof-time boundaries.

The remaining type shapes, error summaries and the prose describing
canonicalization and admission are declared in `contract-bundle.ts`.
`ServerTimeResponse` is the exception: it is translated from core's exported
TypeBox schema. For declarations no runtime value carries, the test suite runs
the real decoders and encoders against each one instead — a declared type that
stops describing the server fails there.

## Consuming it

Reference an exact repository, commit SHA and path. A branch or a floating URL
is not an acceptable lock source.

```
repository  git.superfunction.xyz/superfunction/primitives
path        contracts/mobile/spfn-mobile-contract.json
commit      <the exact 40-hex commit you read it from>
digest      shasum -a 256 contracts/mobile/spfn-mobile-contract.json
```

`upstream-provenance.json` carries everything except the commit. A file cannot
carry the SHA of the commit containing it, so the consumer records which commit
it read.

A published contract version and digest are never modified. A mistake becomes a
new version.
