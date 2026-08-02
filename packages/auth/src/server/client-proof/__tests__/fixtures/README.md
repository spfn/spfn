# Vendored spfn-mobile conformance fixtures

Copied verbatim from the spfn-mobile repository (`Contracts/fixtures/`) so the
primitives test suite does not depend on a sibling checkout.

- Source contract bundle: `spfn-mobile-contract.v1.json`,
  sha256 `07fd82683576e3343753b590e00b5bf9725b2e598e1e5e6282f251e73a433e45`
  (DEV_BUNDLE, hand-authored in spfn-mobile Step 2 — primitives is the single
  authority for the production contract; issue #46 tracks ratification).
- Expected values were derived by `derive-expected-values.py` in spfn-mobile —
  a third implementation independent of both SDKs and of this server.
- `MANIFEST.json` is the upstream manifest; `conformance.test.ts` recomputes
  every file's sha256 against it, so silent drift between the two repositories
  fails the suite.
- All key material is synthetic TEST VECTOR ONLY strings. Nothing here is a
  credential.

Do not edit these files. To update, re-copy from spfn-mobile and update the
digests recorded here and in the upstream manifest together.
