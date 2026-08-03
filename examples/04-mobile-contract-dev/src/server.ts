/**
 * The mobile-contract dev server (issue #46).
 *
 * Exposes the three dev operations at their exact contract wire paths —
 * POST /v1/auth/client-proof/handshake, /v1/echo, /v1/items/list — plus the
 * /control test hooks, so the spfn-mobile Swift/Kotlin integration suites can
 * run against SPFN primitives with only a base-URL change.
 *
 * The default registered key is the synthetic conformance test keypair's
 * public half (TEST VECTOR ONLY — it authenticates nothing). Register other
 * public keys via SPFN_CLIENT_PROOF_PUBLIC_KEYS or, at runtime, the
 * /control/register-key hook — a client generates its own P-256 keypair and
 * only the public half (SPKI DER base64) ever reaches this server.
 *
 * Environment:
 * - PORT                          listen port (default 8791)
 * - SPFN_CLIENT_PROOF_PUBLIC_KEYS comma-separated keyId:spkiDerBase64 pairs
 * - SPFN_CLIENT_PROOF_SESSION_TTL_MS  session TTL (default 600000)
 * - SPFN_CLIENT_PROOF_CONTROL_TOKEN   /control token (default: generated)
 * - SPFN_CLIENT_PROOF_TEST_CLOCK_MS   start on a test clock at this epoch ms
 *                                     (enables /control/advance-clock)
 * - SPFN_CLIENT_PROOF_LAUNCH_FILE     write {"baseUrl","port","controlToken"}
 *                                     JSON here once listening
 */
import { writeFileSync } from 'node:fs';

import { serve } from '@hono/node-server';
import {
    createClientProofDevHandler,
    DEFAULT_SESSION_TTL_MILLIS,
    TestClock,
} from '@spfn/auth/client-proof';

const SYNTHETIC_DEV_PUBLIC_KEYS: Record<string, string> = {
    // TEST VECTOR ONLY — the public half of the synthetic conformance keypair,
    // not a credential. The matching private key is published in the test
    // suite; registering this key grants access to nothing.
    'key-test-0001':
        'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAES7xktjK+fMydT7UZcfuW/vzU9rU/'
        + '+RPVVQKKgxrB1sd9bh6N1bqiBwU/zuw9/LaQ91lWPeWSN9OlT8OlDYXIYg==',
};

function parsePublicKeys(raw: string | undefined): Record<string, string>
{
    if (raw === undefined || raw.trim() === '')
    {
        return SYNTHETIC_DEV_PUBLIC_KEYS;
    }
    const keys: Record<string, string> = {};
    for (const pair of raw.split(','))
    {
        const idx = pair.indexOf(':');
        if (idx <= 0)
        {
            throw new Error('SPFN_CLIENT_PROOF_PUBLIC_KEYS must be comma-separated keyId:spkiDerBase64 pairs');
        }
        keys[pair.slice(0, idx)] = pair.slice(idx + 1);
    }

    return keys;
}

const port = Number(process.env.PORT ?? 8791);
const testClockMs = process.env.SPFN_CLIENT_PROOF_TEST_CLOCK_MS;

const handler = createClientProofDevHandler({
    publicKeys: parsePublicKeys(process.env.SPFN_CLIENT_PROOF_PUBLIC_KEYS),
    sessionTtlMillis: Number(process.env.SPFN_CLIENT_PROOF_SESSION_TTL_MS ?? DEFAULT_SESSION_TTL_MILLIS),
    controlToken: process.env.SPFN_CLIENT_PROOF_CONTROL_TOKEN,
    clock: testClockMs === undefined ? undefined : new TestClock(Number(testClockMs)),
    log: (line) => console.log(line),
});

serve({ fetch: handler.fetch, port, hostname: '127.0.0.1' }, (info) =>
{
    const baseUrl = `http://127.0.0.1:${info.port}`;
    const launchFile = process.env.SPFN_CLIENT_PROOF_LAUNCH_FILE;
    if (launchFile !== undefined && launchFile !== '')
    {
        // The launch file is how a test harness learns the control token —
        // it is never printed.
        writeFileSync(launchFile, JSON.stringify({
            baseUrl,
            port: info.port,
            controlToken: handler.controlToken,
        }));
    }
    console.log(`mobile-contract dev server listening on ${baseUrl}`);
    console.log('operations: POST /v1/auth/client-proof/handshake · /v1/echo · /v1/items/list');
    console.log(`control:    ${baseUrl}/control/health (token: see launch file)`);
});
