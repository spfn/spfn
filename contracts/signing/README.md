# Signing test vectors

`vectors.json` is what an implementation of SPFN's token format checks itself
against: twenty tokens, the public keys that verify them, and the verdict each
one must produce. It is **generated output** — do not edit it by hand.

| File | What it is |
|---|---|
| `vectors.json` | The vectors, their public keys, and the expected verdict of each |
| `record-vectors.ts` | The generator that writes it, and the only place the cases are declared |

## Regenerating

```bash
UPDATE_SIGNING_VECTORS=1 pnpm --filter @spfn/signing test vectors
```

`record-vectors.ts` imports the verifier from `packages/signing/src`, never
from `dist` — a published build lags its sources, and a stale oracle records
stale verdicts. Those sources import each other extensionlessly, which node
cannot resolve on its own, so vitest is the runner:
`packages/signing/src/vectors.test.ts` calls the generator, compares what comes
back with the committed file, and writes only under that variable.

Every case declares the reason it means to exercise, and the generator refuses
to write anything if the verifier disagrees with even one of them. A rule that
changes upstream therefore breaks the recording rather than being quietly
re-recorded, which is the whole point: the verdicts in this file are the
verifier's and never the generator's opinion of what they should be.

## The vectors

`kid` and `alg` name the key that produced the signature, not what the header
claims — six of these vectors exist precisely because those two disagree.
Vectors that need a `maxAgeSec` policy to reach their rule carry their own
`options`; everything else is judged with the defaults at `verifyAt`.

| # | Vector | Verdict | The rule it holds in place |
|---|---|---|---|
| 1 | `ed25519-valid` | `ok` | the anchor: a well-formed token on the default algorithm |
| 2 | `ed25519-expired` | `expired` | `exp` in the past, beyond the skew |
| 3 | `ed25519-bad-signature` | `bad-signature` | one flipped bit in a signature that is otherwise this key's |
| 4 | `es256-valid` | `ok` | the anchor on the other algorithm |
| 5 | `es256-expired` | `expired` | as 2, on ES256 |
| 6 | `es256-bad-signature` | `bad-signature` | as 3, on ES256 |
| 7 | `non-canonical-base64url` | `malformed` | the last character of a segment carries bits no byte uses, so sixteen strings decode to the same 64 bytes; a token that can be rewritten without invalidating it cannot key a one-time-use set |
| 8 | `duplicate-header-member` | `malformed` | RFC 8259 §4 leaves duplicate members undefined and `JSON.parse` keeps the last, so this header is `EdDSA` to one reader and `none` to another |
| 9 | `duplicate-payload-member` | `malformed` | the same scan on the payload, which a port that only checked the header would let through |
| 10 | `crit-present` | `malformed` | `crit` names extensions a verifier must understand; this one implements none, so RFC 7515 §4.1.11 says refuse rather than guess |
| 11 | `typ-not-string` | `malformed` | `typ` is a media type (RFC 7515 §4.1.9); `typ: 5` hands every caller a value its own type says cannot be there |
| 12 | `cty-not-string` | `malformed` | the same rule for `cty` (RFC 7515 §4.1.10) |
| 13 | `alg-none` | `alg-mismatch` | `alg` is only ever compared to the **key's** algorithm, so `none` is a mismatch and never an invitation to skip the check |
| 14 | `alg-not-the-keys` | `alg-mismatch` | the same comparison with a real algorithm: an ES256 header over the Ed25519 key |
| 15 | `unknown-kid` | `unknown-kid` | the header names a key the verifier does not hold — a verdict of its own, not a bad signature |
| 16 | `iat-after-exp` | `invalid-claims` | a token that expired before it was issued: no clock makes both claims true |
| 17 | `non-finite-claim` | `invalid-claims` | `exp: 1e999` parses to `Infinity`; treating a present-but-unusable `exp` as "no expiry given" turns a typo into an immortal token |
| 18 | `not-yet-valid` | `not-yet-valid` | `nbf` an hour ahead, well beyond the default 30 seconds of skew |
| 19 | `too-old` (`maxAgeSec: 300`) | `too-old` | a token that granted itself a longer life than the caller allows |
| 20 | `no-expiry` (`maxAgeSec: 300`) | `no-expiry` | under `maxAgeSec` a missing `exp` leaves the lifetime uncomputable, so it is a refusal and not an exemption |

Every member of `VerifyFailureReason` appears at least once. The list
`vectors.test.ts` checks against is not typed out by hand — it is the keys of a
`Record<VerifyFailureReason, true>`, which stops compiling as soon as the union
grows. A tenth reason therefore fails `pnpm type-check` until it is named there,
and then fails the test until it has a vector of its own.

## What is not here

A vector is one token judged at one fixed instant, so three of the verifier's
behaviours cannot be expressed as one and stay verifier tests in
`packages/signing/src/jws.test.ts` rather than being forced into this file:

- **`now` defaulting to the system clock.** Every vector is judged at
  `verifyAt`, because a file whose verdicts depend on the day it is replayed is
  not a fixed point.
- **A token that is not a string.** `verifyJws(42, keys)` is `malformed`, and a
  JSON `token` member cannot be `42` and still be a token.
- **Key configuration that throws.** A malformed public-key string is the
  deployment's bug, not a verdict about a token, so there is nothing to record.

## Stability

The key material behind these vectors is two fixed 32-byte constants in
`record-vectors.ts`. They are throwaway values used for nothing else, which is
why the private halves are reproducible and are not stored here.

`verifyAt` is the instant every vector is judged at, so `expired` stays expired
and `valid` stays valid however long this file lives.

Vectors 1–6 are **frozen**. superself-apps holds a byte copy of them as
`infra/workspace/bridge/fixtures/signing-vectors.json`, refreshed by copying
this file again and reading the diff, so a token that changed here would be a
diff nobody could review. They carry no `why` member for the same reason: an
added member is a changed byte. `vectors.test.ts` pins all six tokens and the
public keys, out of line, so a change to them fails rather than regenerates.

ECDSA chooses a fresh nonce for each signature, so vectors 4–6 are not
reproducible byte for byte. The generator carries their committed signatures
over whenever the header and payload it built are unchanged, which is what
makes a re-run produce an identical file; the carried signatures still go
through the verifier alongside every other vector, so one that stopped meaning
what its vector claims fails the run rather than being carried past it. For
`es256-bad-signature` that verifier pass proves less than it looks: any wrong
signature over those bytes is `bad-signature`, so what actually holds vector 6's
exact signature in place is the frozen-token pin in `vectors.test.ts` and
nothing else. Everything else is Ed25519, which signs the same bytes the same
way every time.

## Shipping

`vectors.json` is not in the `@spfn/signing` tarball: the package's `files` is
`dist`, `README.md` and `LICENSE`, and this directory is above the package root
where npm cannot reach it anyway. A downstream consumes these vectors by
copying the file out of this repository, not by installing the package.
