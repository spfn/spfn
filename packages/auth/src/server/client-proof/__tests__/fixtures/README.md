# Vendored spfn-mobile conformance fixtures

Vectors from the spfn-mobile repository (`Contracts/fixtures/`), kept here so the
primitives test suite does not depend on a sibling checkout.

These fixtures still name the dev bundle they were derived against
(`07fd82683576e3343753b590e00b5bf9725b2e598e1e5e6282f251e73a433e45`). That
bundle is superseded by this repository's export at
`contracts/mobile/spfn-mobile-contract.v1.json` — see issue #48. The vectors
remain valid because the export restates the same contract facts: what changed
is where the contract is authored, not what it says. spfn-mobile re-derives the
fixtures against the export when it re-pins, and the refreshed copies land here
in the same change.

- Expected values were derived by `derive-expected-values.py` in spfn-mobile —
  a third implementation independent of both SDKs and of this server. Two
  implementations agreeing with each other would prove nothing.
- `MANIFEST.json` is the manifest that came with them; `conformance.test.ts`
  recomputes every file's sha256 against it, so silent drift between the two
  repositories fails the suite.
- All key material is synthetic TEST VECTOR ONLY strings. Nothing here is a
  credential.

Do not edit these files. To update, re-copy from spfn-mobile and update the
digests recorded here and in that manifest together.
