# Signing test vectors

`vectors.json` is what an implementation of SPFN's token format checks itself
against: six tokens, the public keys that verify them, and the verdict each one
must produce, EdDSA first because it is the default algorithm. It is **generated
output** — do not edit it by hand.

| File | What it is |
|---|---|
| `vectors.json` | Six tokens (valid, expired, corrupted × EdDSA, ES256), their public keys, and the expected verdict of each |

Generated and checked by `packages/signing/src/vectors.test.ts`. Regenerate with:

```bash
UPDATE_SIGNING_VECTORS=1 pnpm --filter @spfn/signing test
```

The key material behind these vectors is two fixed 32-byte constants written
into that test file. They are throwaway values used for nothing else, which is
why the private halves are reproducible and are not stored here.

`verifyAt` is the instant every vector is judged at, so `expired` stays expired
and `valid` stays valid however long this file lives.

ECDSA chooses a fresh nonce for each signature, so an ES256 token is never
byte-stable across regenerations. The comparison covers the public keys, headers
and payloads; the committed tokens themselves are checked by verifying them.
