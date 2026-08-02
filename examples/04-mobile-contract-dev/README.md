# 04-mobile-contract-dev — clientProofV1 dev server

The server side of the spfn-mobile dev contract (issue #46): the three
contract operations at their exact wire paths, clientProofV1 admission in the
contract's check order, the contract error envelope, and the `/control` test
hooks the spfn-mobile integration suites drive.

```bash
pnpm install          # from the repo root
cd examples/04-mobile-contract-dev
pnpm dev              # listens on 127.0.0.1:8791
```

## What it serves

| Operation | Method + path | Session |
|---|---|---|
| `auth.clientProof.handshake` | `POST /v1/auth/client-proof/handshake` | issues one |
| `echo.send` | `POST /v1/echo` | required |
| `items.list` | `POST /v1/items/list` | required |

`/control/*` (health, stats, reset, expire-sessions, revoke-key, session-ttl,
hold, advance-clock) mirrors the spfn-mobile reference server's test surface;
every route except `/control/health` needs the `x-spfn-reference-control`
token from the launch file.

## Running the spfn-mobile integration matrix against this server

```bash
SPFN_CLIENT_PROOF_SESSION_TTL_MS=600000 \
SPFN_CLIENT_PROOF_LAUNCH_FILE=/tmp/spfn-client-proof-launch.json \
pnpm dev
```

Point the spfn-mobile suites' base URL at the printed address and read the
control token from the launch file. Default keys are the synthetic conformance
vectors (TEST VECTOR ONLY); inject real dev triples with
`SPFN_CLIENT_PROOF_KEYS=keyId:keyUtf8,...`.

The implementation lives in `@spfn/auth/client-proof`
(`packages/auth/src/server/client-proof/`); this app is wiring only.
