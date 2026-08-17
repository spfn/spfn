# Landing Kit I0 contract set

The frozen cross-repository contracts for the Landing Kit release gate: eight
schemas, the conformance fixtures that pin them, and the case map that ties
every future test back to an approved case ID.

The design these files transcribe lives in
`docs/product/kits/landing-kit/units/` (01–10). Where a unit spells an
interface out, the schema follows it field for field; where it does not, the
schema's `description` says so.

## Where the original lives

`spfn-course/packages/landing-kit/contracts` is the only place these files are
edited. `capabilities` and `spfn` hold byte-identical copies of the subset each
one needs, and their conformance tests refuse a copy that differs by a single
byte.

| Repository | Holds | Checked by |
|---|---|---|
| spfn-course | everything | `packages/landing-kit/test/contracts.test.ts` |
| capabilities | ops discovery, landing report | `packages/funnel/test/landing-kit-contracts.test.ts` |
| spfn | setup envelope, operation journal, provider envelope | `packages/cli/test/landing-kit-contracts.test.ts` |

## The eight contracts

| Contract | Owner | What it fixes |
|---|---|---|
| `setup-descriptor-envelope` | spfn | Generic setup descriptor. The product payload is opaque bytes pinned by a digest. |
| `landing-kit-setup-payload` | @superfunction/landing-kit | The Landing Kit half of the descriptor. |
| `kit-release-manifest` | @superfunction/landing-kit | Immutable release manifest and the artifact digest set. |
| `kit-release-evidence` | @superfunction/landing-kit | Release Evidence Manifest and gate status. |
| `kit-operation-journal` | spfn | Checkpoint and resume identity, including the three wait states. |
| `kit-error-vocabulary` | @superfunction/landing-kit | Every machine-readable error code the surfaces may return. |
| `provider-operation-envelope` | spfn | GitHub, Vercel and Supabase operations in one envelope. |
| `ops-modules-discovery` | @spfn/core/ops | What `spfn ops modules --json` prints. |
| `landing-report-envelope` | @superfunction/landing-kit/ops | The envelope every `landing.*` report returns. |
| `case-map` | @superfunction/landing-kit | Unit 10 tables A–F and H, plus the canonical customer fixture. |

## Changing a contract

1. Edit the schema or fixture here.
2. Run `node conformance/build-manifest.mjs` to refresh digests.
3. Copy the scoped files into `capabilities` and `spfn`.
4. Run all three conformance tests and update the digests recorded in
   `docs/product/kits/landing-kit/evidence/i0.json`.

Bumping a contract means raising its `schemaVersion` and the `const` its schema
pins, never widening an enum in place.

## What never enters a fixture

No secret, no credential, no provider token, no database URL, no purchase
email, no form value and no personal data. A license key appears only as its
`spfnl_` prefix. Several negative fixtures exist precisely to prove the schemas
reject a payload that carries one.
