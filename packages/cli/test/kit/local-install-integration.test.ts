/**
 * One install, end to end, with the local ports actually running things.
 *
 * Everything the other Kit tests fake is real here except the database: pnpm
 * resolves and unpacks from a registry listening on loopback, the release's
 * gate runs as a child process, and Git makes a commit that `git rev-parse`
 * can name afterwards. The point is not coverage — the ports have their own
 * tests — but the join. A port can satisfy its own test and still be wrong
 * about what it hands the next one: an `.npmrc` referencing a variable the
 * child never receives, a lockfile written for a registry the install does not
 * use, a commit attempted in a directory Git was never told about.
 *
 * The database stays a stub, deliberately: standing up PostgreSQL would test
 * PostgreSQL. What the database port does with a real child process is covered
 * in `local-ports.test.ts` and in the last case here.
 *
 * Everything runs against 127.0.0.1, and `--registry` points pnpm at the
 * fixture, so no request can reach a real registry even if a name resolved.
 */

import { execFileSync } from 'node:child_process';
import { execa } from 'execa';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInstall } from '../../src/kit/operations/install.js';
import { createKitRemotePorts } from '../../src/kit/http/index.js';
import { createKitLocalPorts } from '../../src/kit/local/index.js';
import { SpfnDatabasePort } from '../../src/kit/local/database.js';
import { HttpLicensePort } from '../../src/kit/http/control-plane.js';
import { newCandidateCredential } from '../../src/kit/credentials.js';
import { registryNpmrc, REGISTRY_TOKEN_ENV } from '../../src/kit/child-env.js';
import type { DatabasePort, KitAdapters } from '../../src/kit/ports.js';
import { FAKE_KIT_PACKAGE, FakeKitWorld, npmTarball } from './fake-world.js';
import { KitHttpFixture, fixtureLicenseKey } from './http-fixture.js';

const KIT_ID = 'campaign-landing';
const PACKAGES_URL = 'https://packages.superfunction.xyz';
const CONTROL_PLANE_URL = 'https://start.superfunction.xyz';
const CORE = { name: '@spfn/core', version: '0.3.0-beta.5' };
const KIT = { name: FAKE_KIT_PACKAGE, version: '1.0.0' };

/** A database that answers "configured, reachable, nothing waiting". */
const settledDatabase: DatabasePort = {
    async status()
    {
        return { configured: true, reachable: true, applied: ['0001_init'], pending: [] };
    },
    async migrate()
    {
        return { ok: true, applied: ['0001_init'], pending: [] };
    },
};

let fixture: KitHttpFixture;
let world: FakeKitWorld;
let licenseKey: string;
let root: string;
let target: string;
let store: string;
let emptyNpmrc: string;

const pnpmAvailable = hasPnpm();

beforeEach(async () =>
{
    root = mkdtempSync(join(tmpdir(), 'spfn-kit-integration-'));
    target = join(root, 'project');
    store = join(root, 'pnpm-store');
    // An empty file standing in for the machine's own npm configuration. A
    // developer's `~/.npmrc` commonly points a scope at a private registry,
    // and without this the install would reach it — over the real network,
    // carrying the bearer meant for the fixture.
    emptyNpmrc = join(root, 'isolated.npmrc');
    writeFileSync(emptyNpmrc, '', 'utf8');

    fixture = new KitHttpFixture();
    await fixture.start();

    licenseKey = fixtureLicenseKey();
    // Three slots: one for the lockfile seed, one for the install, one spare.
    fixture.addLicense(licenseKey, { kitId: KIT_ID, projectLimit: 3 });
    fixture.addPackage(CORE.name, CORE.version, npmTarball(CORE.name, CORE.version));
    fixture.addPackage(KIT.name, KIT.version, npmTarball(KIT.name, KIT.version));
});

afterEach(async () =>
{
    await fixture.stop();
    rmSync(root, { recursive: true, force: true });
});

function hasPnpm(): boolean
{
    try
    {
        execFileSync('pnpm', ['--version'], { stdio: 'ignore' });

        return true;
    }
    catch
    {
        return false;
    }
}

/**
 * An npm environment that reads no configuration but its own.
 *
 * A developer's `~/.npmrc` usually points a scope at a private registry. Left
 * alone it would take precedence over `--registry`, and the install would
 * leave the machine — carrying a bearer meant for a loopback fixture.
 * `fetch_retries=0` turns a wrong address into a fast failure instead of two
 * minutes of retries.
 */
function isolatedNpmEnv(): Record<string, string>
{
    return {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        npm_config_userconfig: emptyNpmrc,
        npm_config_globalconfig: emptyNpmrc,
        npm_config_fetch_retries: '0',
    };
}

/** Published addresses resolved onto the fixture; the registry is loopback. */
const mappedFetch = (url: string, init?: RequestInit): Promise<Response> => fetch(
    url.replace(CONTROL_PLANE_URL, fixture.origin).replace(PACKAGES_URL, fixture.origin),
    init,
);

/** The scaffold's `package.json`: two real dependencies and one real gate. */
function scaffoldPackageJson(): string
{
    return `${JSON.stringify({
        name: 'kit-scaffold',
        private: true,
        version: '0.0.0',
        type: 'module',
        scripts: { build: 'node -e "process.stdout.write(String(0))"' },
        dependencies: { [CORE.name]: CORE.version, [KIT.name]: KIT.version },
    }, null, 4)}\n`;
}

/**
 * A lockfile for exactly this graph, produced by pnpm itself.
 *
 * Written by running a non-frozen install once in a directory of its own. A
 * lockfile pasted in by hand would either be wrong now or stop being right the
 * next time pnpm changed its format — and the case below exists to prove a
 * *frozen* install works, which needs a lockfile pnpm agrees with.
 */
async function seedLockfile(): Promise<string>
{
    const seed = join(root, 'seed');
    const credential = newCandidateCredential();
    const activation = await new HttpLicensePort({ baseUrl: CONTROL_PLANE_URL, fetchImpl: mappedFetch }).activate({
        kitId: KIT_ID,
        installationId: 'op-lockfile-seed',
        localClientId: 'lc-seed',
        licenseKey,
        candidateCredential: credential,
    });

    expect(activation.status).toBe('activated');

    mkdirSync(seed, { recursive: true });
    writeFileSync(join(seed, 'package.json'), scaffoldPackageJson(), 'utf8');
    writeFileSync(join(seed, '.npmrc'), registryNpmrc(['@spfn', '@superfunction'], fixture.registryUrl), 'utf8');

    // Spawned asynchronously, not with `execFileSync`. The registry pnpm is
    // talking to is this process's own HTTP server, and a synchronous child
    // blocks the event loop that would have answered it — the two would wait
    // for each other until pnpm's socket timed out.
    const seeded = await execa('pnpm', [
        'install',
        '--no-frozen-lockfile',
        '--registry', fixture.registryUrl,
        '--store-dir', store,
        '--ignore-scripts',
        '--ignore-workspace',
    ], {
        cwd: seed,
        env: { ...isolatedNpmEnv(), [REGISTRY_TOKEN_ENV]: credential },
        extendEnv: false,
        reject: false,
        timeout: 180_000,
    });

    if (seeded.exitCode !== 0)
    {
        throw new Error(`seeding the lockfile failed:\n${seeded.stderr}\n${seeded.stdout}`);
    }

    return readFileSync(join(seed, 'pnpm-lock.yaml'), 'utf8');
}

/** Build the release around a given scaffold, and put it in the store. */
function publish(lockfile: string): void
{
    world = new FakeKitWorld({
        kitId: KIT_ID,
        releaseStoreUrl: `${PACKAGES_URL}/kits/${KIT_ID}`,
        registryUrl: fixture.registryUrl,
        releases: [{
            version: KIT.version,
            sequence: 1,
            gates: ['build'],
            scaffoldFiles: {
                'package.json': scaffoldPackageJson(),
                'pnpm-lock.yaml': lockfile,
                'src/app/page.tsx': 'export default function Page() { return null; }\n',
            },
        }],
    });
    fixture.release = {
        catalog: world.signedCatalog(),
        manifests: { [KIT.version]: world.sign(world.latest.manifest) },
        artifacts: world.artifactStore(),
    };
}

function adaptersFor(projectDir: string, database: DatabasePort): KitAdapters
{
    const now = (): string => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const local = createKitLocalPorts({
        packageManager: {
            registryUrl: fixture.registryUrl,
            storeDir: store,
            ignoreScripts: true,
            ignoreWorkspace: true,
            timeoutMs: 180_000,
            extraEnv: isolatedNpmEnv(),
        },
        gateTimeoutMs: 120_000,
    });
    const remote = createKitRemotePorts({
        projectDir,
        endpoints: { controlPlaneUrl: CONTROL_PLANE_URL, registryUrl: fixture.registryUrl, source: 'environment' },
        credentials: world.credentials,
        trustedKeys: world.trustedKeys,
        now,
        packageManager: local.packageManager,
        fetchImpl: mappedFetch,
        timeoutMs: 10_000,
    });

    return {
        clock: { now },
        cliVersion: world.adapters.cliVersion,
        controlPlaneUrl: CONTROL_PLANE_URL,
        registryUrl: fixture.registryUrl,
        trustedKeys: world.trustedKeys,
        credentials: world.credentials,
        // A setup link must be https and on the official origin, so the
        // descriptor still comes from the fixture fetcher rather than loopback.
        setupFetcher: world.adapters.setupFetcher,
        catalog: remote.catalog,
        license: remote.license,
        registry: remote.registry,
        artifacts: remote.artifacts,
        scaffold: remote.scaffold,
        packageManager: remote.packageManager,
        database,
        gates: local.gates,
        git: local.git,
        loadProjectModule: world.adapters.loadProjectModule,
    };
}

function install(): ReturnType<typeof runInstall>
{
    return runInstall({
        setupUrl: world.setupUrl,
        targetDir: target,
        readLicenseKey: async () => licenseKey,
        json: true,
        write: () => undefined,
    }, adaptersFor(target, settledDatabase));
}

describe.runIf(pnpmAvailable)('an install with the local ports actually running', () =>
{
    it('installs the exact graph from the loopback registry, runs the gate and commits', async () =>
    {
        publish(await seedLockfile());

        const result = await install();

        expect(result.status).toBe('completed');
        expect(result.code).toBe('KIT_LOCAL_READY');

        // pnpm really unpacked both packages from the fixture.
        expect(existsSync(join(target, 'node_modules', CORE.name, 'package.json'))).toBe(true);
        expect(JSON.parse(readFileSync(join(target, 'node_modules', KIT.name, 'package.json'), 'utf8')).version)
            .toBe(KIT.version);

        // Git really made a commit, and the worktree is clean afterwards.
        expect(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: target }).toString().trim())
            .toMatch(/^[0-9a-f]{40}$/);
        expect(execFileSync('git', ['status', '--porcelain'], { cwd: target }).toString().trim()).toBe('');
        expect(execFileSync('git', ['log', '-1', '--format=%s'], { cwd: target }).toString().trim())
            .toBe(`chore: install ${KIT_ID} ${KIT.version}`);

        // And every package of the graph was proven through the proxy first.
        const asked = fixture.requests.map(request => decodeURIComponent(request.path));

        expect(asked).toContain(`/npm/${KIT.name}`);
        expect(asked).toContain(`/npm/${CORE.name}`);
    }, 300_000);

    it('refuses rather than resolving when the release ships a lockfile for another graph', async () =>
    {
        // The scaffold's lockfile no longer describes its own `package.json`.
        // A frozen install must stop; resolving something else would produce a
        // project the release never pinned.
        publish((await seedLockfile()).replace(new RegExp(CORE.version, 'g'), '0.3.0-beta.4'));

        const result = await install();

        expect(result.status).toBe('failed');
        expect(existsSync(join(target, 'node_modules'))).toBe(false);
    }, 300_000);
});

describe('the database port against its real child process', () =>
{
    it('reports a project with no database configured, without reading its env values', async () =>
    {
        const project = join(root, 'no-database');

        mkdirSync(project, { recursive: true });
        writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'p', private: true }), 'utf8');

        const status = await new SpfnDatabasePort({ timeoutMs: 120_000 }).status({ cwd: project });

        expect(status.configured).toBe(false);
        expect(status.pending).toEqual([]);
    }, 180_000);
});
