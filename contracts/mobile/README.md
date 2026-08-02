# Mobile contract export

`spfn-mobile-contract.v1.json` is what the spfn-mobile Swift and Kotlin SDKs
generate their client code from. It is **generated output** — do not edit it.

| File | What it is |
|---|---|
| `spfn-mobile-contract.v1.json` | The contract bundle the SDK codegen reads |
| `upstream-provenance.json` | The evidence spfn-mobile's validator requires before a lock may claim an upstream export |

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

Type shapes, error summaries and the prose describing canonicalization and
admission are declared in `contract-bundle.ts`. No runtime value carries them,
so the test suite runs the real decoders and encoders against every declaration
instead — a declared type that stops describing the server fails there.

## Consuming it

Reference an exact repository, commit SHA and path. A branch or a floating URL
is not an acceptable lock source.

```
repository  git.superfunction.xyz/superfunction/primitives
path        contracts/mobile/spfn-mobile-contract.v1.json
commit      <the exact 40-hex commit you read it from>
digest      shasum -a 256 contracts/mobile/spfn-mobile-contract.v1.json
```

`upstream-provenance.json` carries everything except the commit. A file cannot
carry the SHA of the commit containing it, so the consumer records which commit
it read.

A published contract version and digest are never modified. A mistake becomes a
new version.
