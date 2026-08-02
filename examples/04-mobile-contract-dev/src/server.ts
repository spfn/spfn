/**
 * The mobile-contract dev server (issue #46).
 *
 * Exposes the three dev operations at their exact contract wire paths —
 * POST /v1/auth/client-proof/handshake, /v1/echo, /v1/items/list — plus the
 * /control test hooks, so the spfn-mobile Swift/Kotlin integration suites can
 * run against SPFN primitives with only a base-URL change.
 *
 * Dev keys default to the synthetic conformance vectors (TEST VECTOR ONLY —
 * they authenticate nothing). Provide real dev triples via SPFN_CLIENT_PROOF_KEYS.
 *
 * Environment:
 * - PORT                          listen port (default 8791)
 * - SPFN_CLIENT_PROOF_KEYS        comma-separated keyId:keyUtf8 pairs
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

const SYNTHETIC_DEV_KEYS: Record<string, string> = {
    // TEST VECTOR ONLY — the synthetic conformance key, not a credential.
    'key-test-0001': 'spfn-test-key-not-a-secret-0001',
};

function parseKeys(raw: string | undefined): Record<string, string>
{
    if (raw === undefined || raw.trim() === '')
    {
        return SYNTHETIC_DEV_KEYS;
    }
    const keys: Record<string, string> = {};
    for (const pair of raw.split(','))
    {
        const idx = pair.indexOf(':');
        if (idx <= 0)
        {
            throw new Error('SPFN_CLIENT_PROOF_KEYS must be comma-separated keyId:key pairs');
        }
        keys[pair.slice(0, idx)] = pair.slice(idx + 1);
    }

    return keys;
}

const port = Number(process.env.PORT ?? 8791);
const testClockMs = process.env.SPFN_CLIENT_PROOF_TEST_CLOCK_MS;

const handler = createClientProofDevHandler({
    keys: parseKeys(process.env.SPFN_CLIENT_PROOF_KEYS),
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
