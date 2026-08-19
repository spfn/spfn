/**
 * Unit 10 table D — the update and ownership half.
 *
 * D1 (the update installs the release it says it installed), D2 (customer
 * source is byte-identical across it) and D4 (managed drift stops it before
 * the first write), plus the edge authorisation D1 depends on. Each `it`
 * names one cell and asserts that cell and nothing else.
 *
 * The cells that need a real registry, a real database and a real keychain are
 * proved by the G5 run against the certification control plane; what is here
 * is everything settlable without one.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { FakeKitWorld, FAKE_LICENSE_KEY } from './fake-world.js';
import { runInstall } from '../../src/kit/operations/install.js';
import { runRestore } from '../../src/kit/operations/restore.js';
import { runUpdate } from '../../src/kit/operations/update.js';
import { runRecover } from '../../src/kit/operations/recover.js';
import { KIT_EXIT, isKitError } from '../../src/kit/errors.js';
import { readInstalledLock, readLicenseFile } from '../../src/kit/installed-state.js';
import { resolveUpdateEdges } from '../../src/kit/manifest.js';
import {
    KIT_KEYCHAIN_NAMESPACE_ENV,
    KIT_KEYCHAIN_SERVICE,
    kitKeychainService,
} from '../../src/kit/credentials.js';
import { compareCustomerSource, customerSourceDigests } from '../../src/kit/customer-source.js';

const R0 = {
    version: '1.0.0',
    sequence: 1,
    releaseClass: 'feature' as const,
};

/* The shape a real R1 has: it names its predecessor in `fromReleases` and
   ships no edge record, because nothing can carry an edge from a release it
   was not built beside. */
const R1 = {
    version: '1.1.0',
    sequence: 2,
    releaseClass: 'maintenance' as const,
    directFrom: ['1.0.0'],
    managed: { 'src/app/api/landing/route.ts': '// managed bridge 1.1.0\n' },
};

const KIT_PACKAGE = '@superfunction/landing-kit';

function silent(): void 
{}

/** Lines present in the second text and not the first. */
function diffLines(before: string, after: string): string[]
{
    const seen = new Set(before.split('\n'));

    return after.split('\n').filter(line => !seen.has(line));
}

/** What `package.json` declares for one dependency. */
function declaredVersion(projectDir: string, name: string): string | undefined
{
    const document = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8')) as
        { dependencies?: Record<string, string> };

    return document.dependencies?.[name];
}

/** What `node_modules` actually holds for one dependency. */
function installedVersion(projectDir: string, name: string): string | undefined
{
    const file = join(projectDir, 'node_modules', ...name.split('/'), 'package.json');

    return existsSync(file)
        ? (JSON.parse(readFileSync(file, 'utf8')) as { version?: string }).version
        : undefined;
}

let root: string;
let target: string;

beforeEach(() =>
{
    root = mkdtempSync(join(tmpdir(), 'spfn-kit-d-'));
    target = join(root, 'project');
});

afterEach(() =>
{
    rmSync(root, { recursive: true, force: true });
});

/** The landing copy and asset a customer owns, written the way one is. */
const CUSTOMER_FILES = {
    'src/landing/hero.tsx': '// customer-owned landing copy\n',
    'public/hero.svg': '<svg/>\n',
};

function writeCustomerFiles(projectDir: string): void
{
    for (const [path, content] of Object.entries(CUSTOMER_FILES))
    {
        const absolute = join(projectDir, path);

        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, content);
    }
}

async function install(world: FakeKitWorld): Promise<void>
{
    const result = await runInstall({
        setupUrl: world.setupUrl,
        targetDir: target,
        readLicenseKey: async () => FAKE_LICENSE_KEY,
        json: true,
        write: silent,
    }, world.adapters);

    if (result.status !== 'completed')
    {
        throw new Error(`install did not complete: ${result.code}`);
    }

    writeCustomerFiles(target);
}

/** A clean clone: the committed tree, without node_modules or journal state. */
function cleanClone(name = 'clone'): string
{
    const clone = join(root, name);

    cpSync(target, clone, {
        recursive: true,
        filter: source => !source.includes('node_modules') && !source.includes(join('.spfn', 'operations')),
    });

    return clone;
}

async function failureOf(run: () => Promise<unknown>): Promise<{ code: string; exitCode: number }>
{
    try
    {
        await run();
    }
    catch (error)
    {
        if (!isKitError(error))
        {
            throw error;
        }

        return { code: error.code, exitCode: error.exitCode };
    }

    throw new Error('expected the operation to be refused');
}

describe('D2 — an update leaves customer source byte-identical', () =>
{
    it('completes with the customer digests it started from', async () =>
    {
        const world = new FakeKitWorld({ releases: [R0] });

        await install(world);

        const before = customerSourceDigests(target, [readInstalledLock(join(target, '.spfn', 'kit-lock.json'))!]);

        world.publish(R1);

        const result = await runUpdate({ projectDir: target, json: true, write: silent }, world.adapters);

        expect(result.status).toBe('completed');
        expect(readInstalledLock(join(target, '.spfn', 'kit-lock.json'))?.release).toBe('1.1.0');

        const after = customerSourceDigests(target, [readInstalledLock(join(target, '.spfn', 'kit-lock.json'))!]);

        expect(compareCustomerSource(before, after)).toEqual([]);
        // The landing file is a customer file, so its absence from the diff
        // has to mean it was compared rather than never looked at.
        expect(Object.keys(before)).toContain('src/landing/hero.tsx');
    });

    it('refuses to finish when something rewrote a customer file on the way past', async () =>
    {
        const world = new FakeKitWorld({ releases: [R0] });

        await install(world);
        world.publish(R1);

        /* A package manager that runs a postinstall script, a migration runner
           with a codemod, a build step that formats: the guard exists because
           the CLI's own intent is not the only thing that writes here. */
        world.onPackageInstall = () =>
        {
            writeFileSync(join(target, 'src/landing/hero.tsx'), '// rewritten by something in the graph\n');
        };

        const failure = await runUpdate({ projectDir: target, json: true, write: silent }, world.adapters);

        expect(failure.status).toBe('failed');
        expect(failure.code).toBe('CLI_CUSTOMER_SOURCE_CHANGED');
        expect(failure.exitCode).toBe(KIT_EXIT.REFUSED);
        // Refused before the commit, so the checkout can be inspected as it is.
        expect(readInstalledLock(join(target, '.spfn', 'kit-lock.json'))?.release).toBe('1.0.0');
    });

    it('does not call a managed file or generated state a customer overwrite', async () =>
    {
        const world = new FakeKitWorld({ releases: [R0] });

        await install(world);

        const lock = readInstalledLock(join(target, '.spfn', 'kit-lock.json'))!;
        const digests = customerSourceDigests(target, [lock]);

        expect(Object.keys(digests)).not.toContain(lock.agentPack.path);
        expect(Object.keys(digests).some(path => path.startsWith('.spfn/'))).toBe(false);
        // Unit 05 §6.2 makes package.json shared, so a byte digest of it would
        // call every legitimate dependency change a customer overwrite.
        expect(Object.keys(digests)).not.toContain('package.json');
        expect(Object.keys(digests)).not.toContain('pnpm-lock.yaml');
    });
});

describe('D4 — managed drift stops the update before the first write', () =>
{
    it('refuses, and the managed file still holds the edit', async () =>
    {
        const world = new FakeKitWorld({ releases: [R0] });

        await install(world);
        world.publish(R1);

        const lock = readInstalledLock(join(target, '.spfn', 'kit-lock.json'))!;
        const drifted = join(target, lock.managedResources[0].path);

        mkdirSync(dirname(drifted), { recursive: true });
        writeFileSync(drifted, '// hand-edited managed bridge\n');

        const before = customerSourceDigests(target, [lock]);
        const failure = await failureOf(async () =>
            runUpdate({ projectDir: target, json: true, write: silent }, world.adapters));

        expect(failure.code).toBe('KIT_MANAGED_DRIFT');
        expect(failure.exitCode).toBe(KIT_EXIT.REFUSED);
        expect(readInstalledLock(join(target, '.spfn', 'kit-lock.json'))?.release).toBe('1.0.0');
        expect(readFileSync(drifted, 'utf8')).toBe('// hand-edited managed bridge\n');
        expect(compareCustomerSource(before, customerSourceDigests(target, [lock]))).toEqual([]);
    });
});

describe('the update edge a first release can actually declare', () =>
{
    it('takes a direct hop the target manifest names in fromReleases', () =>
    {
        expect(resolveUpdateEdges([], '1.0.0', '1.1.0', ['1.0.0'])).toEqual([]);
    });

    it('refuses a hop no edge and no fromReleases entry authorises', async () =>
    {
        expect(() => resolveUpdateEdges([], '1.0.0', '1.1.0', ['0.9.0'])).toThrowError(/KIT_UPDATE_EDGE_MISSING|No signed update path/);
    });

    it('prefers a published edge over the direct authorisation, because only the edge pins the input digest', () =>
    {
        const edge = {
            id: 'edge-1.0.0-1.1.0',
            fromRelease: '1.0.0',
            toRelease: '1.1.0',
            resources: [{ path: 'src/app/api/landing/route.ts', expectedFromDigest: 'sha256:aa', targetDigest: 'sha256:bb' }],
        };

        expect(resolveUpdateEdges([edge], '1.0.0', '1.1.0', ['1.0.0'])).toEqual([edge]);
    });

    it('updates a real project across a direct hop with no edge record', async () =>
    {
        const world = new FakeKitWorld({ releases: [R0] });

        await install(world);
        world.publish(R1);

        const result = await runUpdate({ projectDir: target, json: true, write: silent }, world.adapters);

        expect(result.status).toBe('completed');
        expect(result.plan === undefined || result.plan.edges).not.toBe(undefined);
        expect(readInstalledLock(join(target, '.spfn', 'kit-lock.json'))?.release).toBe('1.1.0');
    });

    it('still refuses an update whose installed release the target never named', async () =>
    {
        const world = new FakeKitWorld({ releases: [R0] });

        await install(world);
        world.publish({ ...R1, directFrom: ['0.9.0'] });

        const failure = await failureOf(async () =>
            runUpdate({ projectDir: target, json: true, write: silent }, world.adapters));

        expect(failure.code).toBe('KIT_UPDATE_EDGE_MISSING');
    });
});

describe('D1 — the update installs the release it says it installed', () =>
{
    it('repins the dependency declaration and leaves the target graph on disk', async () =>
    {
        const world = new FakeKitWorld({ releases: [R0] });

        await install(world);

        expect(declaredVersion(target, KIT_PACKAGE)).toBe('1.0.0');

        world.publish(R1);

        const result = await runUpdate({ projectDir: target, json: true, write: silent }, world.adapters);

        expect(result.status).toBe('completed');
        expect(declaredVersion(target, KIT_PACKAGE)).toBe('1.1.0');
        // The Kit lock is not evidence of anything on its own: it is written
        // by the same operation. What the project runs is in node_modules.
        expect(installedVersion(target, KIT_PACKAGE)).toBe('1.1.0');
        expect(readInstalledLock(join(target, '.spfn', 'kit-lock.json'))?.release).toBe('1.1.0');
    });

    it('repins the versions and leaves the rest of package.json byte-identical', async () =>
    {
        const world = new FakeKitWorld({ releases: [R0] });

        await install(world);

        const before = readFileSync(join(target, 'package.json'), 'utf8');

        world.publish(R1);
        await runUpdate({ projectDir: target, json: true, write: silent }, world.adapters);

        const after = readFileSync(join(target, 'package.json'), 'utf8');
        const changed = diffLines(before, after);

        /* Unit 05 §6.2 makes this file shared: the Kit owns its dependency
           keys and the customer owns everything else, formatting included. An
           update that repins one version and reindents the file has rewritten
           a customer file to change a Kit one. */
        expect(changed).toEqual([`        "${KIT_PACKAGE}": "1.1.0"`]);
        expect(before.split('\n').length).toBe(after.split('\n').length);
    });

    it('refuses rather than record a release the tree does not hold', async () =>
    {
        const world = new FakeKitWorld({ releases: [R0] });

        await install(world);
        world.publish(R1);

        /* A package manager that reports success and installs the previous
           graph — a stale lockfile does exactly this, and it is the failure
           that made the lock and the tree disagree in the first place. */
        world.onPackageInstall = (projectDir) =>
        {
            writeFileSync(
                join(projectDir, 'node_modules', '@superfunction', 'landing-kit', 'package.json'),
                `${JSON.stringify({ name: KIT_PACKAGE, version: '1.0.0' }, null, 4)}\n`,
            );
        };

        const result = await runUpdate({ projectDir: target, json: true, write: silent }, world.adapters);

        expect(result.status).toBe('failed');
        expect(result.code).toBe('KIT_UNSUPPORTED_RESOLUTION');
        expect(readInstalledLock(join(target, '.spfn', 'kit-lock.json'))?.release).toBe('1.0.0');
    });

    it('refuses an install whose committed state a clean clone would not get', async () =>
    {
        const world = new FakeKitWorld({ releases: [R0] });

        // What a scaffold whose .gitignore covers `.spfn/` produces: every
        // gate green, and a repository nothing can be restored from.
        world.faults.untrackedCommittedState = ['.spfn/kit-lock.json'];

        const result = await runInstall({
            setupUrl: world.setupUrl,
            targetDir: target,
            readLicenseKey: async () => FAKE_LICENSE_KEY,
            json: true,
            write: silent,
        }, world.adapters);

        expect(result.status).toBe('failed');
        expect(result.code).toBe('KIT_LOCK_INVALID');
        expect(String(result.evidence?.untracked)).toContain('.spfn/kit-lock.json');
    });

    it('counts the Agent Pack cache as committed state, because the guide falls back to it', async () =>
    {
        const world = new FakeKitWorld({ releases: [R0] });

        // The lock and the licence file are tracked; the expanded pack is not.
        // A clone then restores nothing and `spfn kit guide` has no cache —
        // and every gate on the installing machine is still green.
        world.faults.untrackedCommittedState = ['.spfn/agent-pack.json'];

        const result = await runInstall({
            setupUrl: world.setupUrl,
            targetDir: target,
            readLicenseKey: async () => FAKE_LICENSE_KEY,
            json: true,
            write: silent,
        }, world.adapters);

        expect(result.status).toBe('failed');
        expect(result.code).toBe('KIT_LOCK_INVALID');
        expect(String(result.evidence?.untracked)).toContain('.spfn/agent-pack.json');
    });
});
