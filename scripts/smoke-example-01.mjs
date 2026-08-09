#!/usr/bin/env node
/**
 * Boot examples/01-minimal-api and check it answers what its README promises.
 *
 * Why this exists: issue #119 was an example that could not start. The README
 * said it needed no database; the server refused to boot without DATABASE_URL.
 * It reached main and stayed there because nothing in this repository ever ran
 * an example — `next build` compiles the frontend and never touches the SPFN
 * server. This script is that missing run, and it needs no database, no Redis
 * and no secrets, which is why it can gate every pull request.
 *
 * It asserts four things, each one a defect that actually shipped, or the fix
 * for one:
 *   1. the server starts at all                     (issue #119)
 *   2. GET /_core/health answers 200                (503 forever when the
 *                                                    database was absent on
 *                                                    purpose)
 *   3. GET /health answers 410 naming the new path  (the endpoint moved; a bare
 *                                                    404 would leave an operator
 *                                                    whose probe broke with
 *                                                    nothing to search for)
 *   4. no route is shadowed at boot                 (examples shipped a
 *                                                    /health route that never
 *                                                    ran)
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const EXAMPLE_DIR = join(process.cwd(), 'examples', '01-minimal-api');
const PORT = process.env.SMOKE_PORT ?? '8795';
const BASE = `http://127.0.0.1:${PORT}`;

// Where the built-in health endpoint answers. `/health` is not it any more:
// @spfn/core registers nothing there, and the path belongs to the app.
const HEALTH_PATH = '/_core/health';
const LEGACY_HEALTH_PATH = '/health';
const BOOT_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 500;

const failures = [];
let serverOutput = '';
let server = null;

function log(message)
{
    console.log(`[smoke] ${message}`);
}

function check(name, ok, detail)
{
    if (ok)
    {
        log(`ok   — ${name}`);

        return;
    }

    log(`FAIL — ${name}${detail ? `: ${detail}` : ''}`);
    failures.push(name);
}

function run(command, args, cwd)
{
    return new Promise((resolve, reject) =>
    {
        const child = spawn(command, args, { cwd, stdio: 'inherit' });

        child.on('error', reject);
        child.on('exit', code => code === 0
            ? resolve()
            : reject(new Error(`${command} ${args.join(' ')} exited ${code}`)));
    });
}

/**
 * Refuse to run when something already holds the port. Without this the checks
 * below would interrogate whatever else is listening and report its answers as
 * the example's — which is how two verification rounds of PR #133 were read as
 * "the fix does not work" while a stale process answered from the old build.
 * A container has a port to itself; a developer's machine does not.
 */
function assertPortIsFree()
{
    return new Promise((resolve, reject) =>
    {
        const probe = createServer();

        probe.once('error', error => error.code === 'EADDRINUSE'
            ? reject(new Error(
                `port ${PORT} is already in use — stop that process or set SMOKE_PORT`,
            ))
            : reject(error));

        probe.once('listening', () => probe.close(resolve));
        probe.listen(Number(PORT), '127.0.0.1');
    });
}

/**
 * `spfn start --server-only` only spawns `node .spfn/prod-server.mjs`, so this
 * starts that file directly. Going through the CLI would put a parent process
 * between us and the listener, and killing the parent leaves the listener
 * holding the port — the exact confusion that made two verification rounds of
 * PR #133 read as "the fix does not work".
 */
function startServer()
{
    const entry = join(EXAMPLE_DIR, '.spfn', 'prod-server.mjs');

    if (!existsSync(entry))
    {
        throw new Error(`${entry} is missing — "spfn build --server-only" did not produce it`);
    }

    const child = spawn(process.execPath, [entry], {
        cwd: EXAMPLE_DIR,
        env: {
            ...process.env,
            NODE_ENV: 'production',
            SPFN_PORT: PORT,
            SPFN_HOST: '127.0.0.1',
        },
    });

    const capture = (chunk) =>
    {
        const text = chunk.toString();

        serverOutput += text;
        process.stdout.write(text);
    };

    child.stdout.on('data', capture);
    child.stderr.on('data', capture);

    return child;
}

async function waitForBoot()
{
    const deadline = Date.now() + BOOT_TIMEOUT_MS;
    let exited = false;

    let booted = false;

    server.on('exit', (code) =>
    {
        exited = true;

        // Only worth reporting while we are still waiting — the same event
        // fires when this script stops the server after a successful run.
        if (!booted)
        {
            log(`server process exited with code ${code} before it answered`);
        }
    });

    while (Date.now() < deadline)
    {
        if (exited)
        {
            throw new Error('the server exited during boot — see its output above');
        }

        try
        {
            const response = await fetch(`${BASE}${HEALTH_PATH}`);

            if (response.ok)
            {
                booted = true;

                return;
            }

            throw new Error(`GET ${HEALTH_PATH} answered ${response.status}`);
        }
        catch (error)
        {
            if (error.message.startsWith(`GET ${HEALTH_PATH} answered`))
            {
                throw error;
            }
            // Connection refused while the server is still coming up.
        }

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error(`the server did not answer within ${BOOT_TIMEOUT_MS / 1000}s`);
}

async function assertContract()
{
    const greeting = await fetch(`${BASE}/greeting?name=ci`);
    const body = greeting.ok ? await greeting.json() : null;

    check('GET /greeting answers 200', greeting.ok, `got ${greeting.status}`);
    check(
        'GET /greeting echoes its query parameter',
        body?.message === 'Hello, ci!',
        `body was ${JSON.stringify(body)}`,
    );

    const health = await fetch(`${BASE}${HEALTH_PATH}`);

    check(`GET ${HEALTH_PATH} answers 200`, health.ok, `got ${health.status}`);

    // The endpoint moved, and the old path has to say where it went. A readiness
    // probe failure surfaces neither a response body nor a status text to an
    // operator, so this is the difference between a searchable answer and a 404.
    const moved = await fetch(`${BASE}${LEGACY_HEALTH_PATH}`);
    const movedBody = moved.status === 410 ? await moved.json() : null;

    check(
        `GET ${LEGACY_HEALTH_PATH} answers 410`,
        moved.status === 410,
        `got ${moved.status}`,
    );
    check(
        `GET ${LEGACY_HEALTH_PATH} names the new path`,
        movedBody?.movedTo === HEALTH_PATH,
        `body was ${JSON.stringify(movedBody)}`,
    );

    check(
        'no app route is shadowed at boot',
        !serverOutput.includes('never runs'),
        'the boot log carries a shadowed-route warning',
    );
}

async function main()
{
    await assertPortIsFree();

    log('building the example server');
    await run('pnpm', ['exec', 'spfn', 'build', '--server-only'], EXAMPLE_DIR);

    log(`starting the server on ${BASE}`);
    server = startServer();

    try
    {
        await waitForBoot();
        log('server answered — checking the contract');
        await assertContract();
    }
    finally
    {
        server.kill('SIGTERM');
    }

    if (failures.length > 0)
    {
        log(`${failures.length} check(s) failed`);
        process.exit(1);
    }

    log('all checks passed');
}

main().catch((error) =>
{
    log(`error: ${error.message}`);
    server?.kill('SIGTERM');
    process.exit(1);
});
