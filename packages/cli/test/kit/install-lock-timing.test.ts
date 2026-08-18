/**
 * F7: the gates read the lock, so the lock has to exist before they run.
 *
 * Found during M3. An install went all the way through activation,
 * materialization, the exact frozen install and the migrations, and then failed
 * its own `kit-check` gate with "This project has no readable Kit lock" — on a
 * project that was, in every other respect, correctly installed. The gate runs
 * `spfn kit check`, `check` needs a lock to check against, and the lock was
 * written a few lines *after* the gates in the same step.
 *
 * The fix moves the write to the moment the exact graph lands, which is also
 * the first moment the record is true: everything a lock names — the release,
 * the manifest digest, the package integrities — is settled once the graph is
 * on disk. These tests pin both halves of that: the ordering on a fresh run,
 * and the restore on a resume of an operation that installed its graph before
 * the fix existed.
 */

import { existsSync, mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInstall } from '../../src/kit/operations/install.js';
import { runResume } from '../../src/kit/operations/resume.js';
import { readInstalledLock } from '../../src/kit/installed-state.js';
import { JournalStore } from '../../src/kit/journal.js';
import type { GateResult, KitAdapters } from '../../src/kit/ports.js';
import type { KitGate } from '../../src/kit/manifest.js';
import { FakeKitWorld, FAKE_LICENSE_KEY } from './fake-world.js';

let root: string;
let target: string;

beforeEach(() =>
{
    root = mkdtempSync(join(tmpdir(), 'spfn-kit-lock-'));
    target = join(root, 'project');
});

afterEach(() =>
{
    rmSync(root, { recursive: true, force: true });
});

function lockFile(): string
{
    return join(target, '.spfn', 'kit-lock.json');
}

function installRequest(world: FakeKitWorld)
{
    return {
        setupUrl: world.setupUrl,
        targetDir: target,
        readLicenseKey: async () => FAKE_LICENSE_KEY,
        json: true,
        write: () => undefined,
    };
}

function resumeRequest()
{
    return {
        projectDir: target,
        readLicenseKey: async () => FAKE_LICENSE_KEY,
        json: true,
        write: () => undefined,
    };
}

/**
 * A gate port that answers the way the real `kit-check` gate does: by needing
 * a readable lock, and refusing when there is none.
 */
function lockReadingGates(world: FakeKitWorld, seen: { gate: KitGate; hadLock: boolean }[]): KitAdapters
{
    return {
        ...world.adapters,
        gates: {
            async run(gate: KitGate): Promise<GateResult>
            {
                const hadLock = existsSync(lockFile());

                seen.push({ gate, hadLock });

                if (gate === 'kit-check' && !hadLock)
                {
                    // The message the M3 run actually failed with.
                    return { ok: false, summary: 'This project has no readable Kit lock' };
                }
                if (world.faults.failingGates.has(gate))
                {
                    return { ok: false, summary: `${gate} failed in the fixture` };
                }

                return { ok: true };
            },
        },
    };
}

describe('the lock is written when the graph lands, not after the gates', () =>
{
    it('lets the kit-check gate read a lock, and the install completes', async () =>
    {
        const world = new FakeKitWorld();
        const seen: { gate: KitGate; hadLock: boolean }[] = [];
        const result = await runInstall(installRequest(world), lockReadingGates(world, seen));

        expect(result.status).toBe('completed');
        expect(result.code).toBe('KIT_LOCAL_READY');

        const check = seen.find(entry => entry.gate === 'kit-check');

        expect(check?.hadLock).toBe(true);
        // Every gate saw it, not just the one that happened to run first.
        expect(seen.every(entry => entry.hadLock)).toBe(true);
    });

    it('names the installed release in the lock the gates read', async () =>
    {
        const world = new FakeKitWorld();

        await runInstall(installRequest(world), lockReadingGates(world, []));

        const lock = readInstalledLock(lockFile());

        expect(lock?.release).toBe('1.0.0');
        expect(lock?.kitId).toBe('campaign-landing');
        expect(lock?.manifestDigest).toBe(world.latest.manifest.manifestDigest ?? lock?.manifestDigest);
        expect(lock?.packages.length).toBeGreaterThan(0);
    });

    it('has the lock in place before the gates even when one of them fails', async () =>
    {
        const world = new FakeKitWorld();
        const seen: { gate: KitGate; hadLock: boolean }[] = [];

        world.faults.failingGates.add('build');

        const failed = await runInstall(installRequest(world), lockReadingGates(world, seen));

        expect(failed.code).toBe('KIT_GATE_FAILED');
        // A failed gate leaves the lock behind on purpose: the resume that
        // follows has to be able to read what this project is.
        expect(readInstalledLock(lockFile())?.release).toBe('1.0.0');
        expect(existsSync(join(target, '.git'))).toBe(false);
    });

    it('is written before the migration step, which can stop and wait', async () =>
    {
        const world = new FakeKitWorld();

        world.faults.databaseConfigured = false;

        const waiting = await runInstall(installRequest(world), world.adapters);

        expect(waiting.code).toBe('KIT_WAITING_DATABASE');
        // Waiting on a database does not make the project's identity unknown.
        expect(readInstalledLock(lockFile())?.release).toBe('1.0.0');
    });
});

describe('a resume restores a lock the run before it never wrote', () =>
{
    /** The M3 operation exactly: graph installed, checkpoint done, no lock. */
    async function installedWithoutLock(world: FakeKitWorld): Promise<void>
    {
        world.faults.failingGates.add('build');

        const failed = await runInstall(installRequest(world), world.adapters);

        expect(failed.code).toBe('KIT_GATE_FAILED');
        expect(existsSync(lockFile())).toBe(true);

        // Put the project back into the state the live M3 operation is in: the
        // dependencies checkpoint completed, and no lock on disk.
        unlinkSync(lockFile());
        world.faults.failingGates.clear();
    }

    it('writes the lock during checkpoint re-verification, and the gates then pass', async () =>
    {
        const world = new FakeKitWorld();
        const seen: { gate: KitGate; hadLock: boolean }[] = [];

        await installedWithoutLock(world);

        const journal = new JournalStore(target, { now: () => world.now() }).readActive();

        expect(journal?.checkpoints.find(entry => entry.id === 'install-frozen')?.status).toBe('completed');
        expect(existsSync(lockFile())).toBe(false);

        const resumed = await runResume(resumeRequest(), lockReadingGates(world, seen));

        expect(resumed.status).toBe('completed');
        expect(readInstalledLock(lockFile())?.release).toBe('1.0.0');
        expect(seen.find(entry => entry.gate === 'kit-check')?.hadLock).toBe(true);
    });

    it('does not reinstall the graph to get the lock back', async () =>
    {
        const world = new FakeKitWorld();

        await installedWithoutLock(world);

        const before = world.childEnvironments.length;

        await runResume(resumeRequest(), world.adapters);

        // The restore is a write, not a reinstall: the package manager was not
        // asked to do the whole exact install again.
        expect(world.childEnvironments.length).toBe(before);
        expect(existsSync(lockFile())).toBe(true);
    });

    it('leaves a lock that is already there exactly as it is', async () =>
    {
        const world = new FakeKitWorld();

        world.faults.failingGates.add('build');
        await runInstall(installRequest(world), world.adapters);

        const before = readInstalledLock(lockFile());

        world.faults.failingGates.clear();
        await runResume(resumeRequest(), world.adapters);

        const after = readInstalledLock(lockFile());

        expect(after?.installedAt).toBe(before?.installedAt);
        expect(after?.release).toBe(before?.release);
    });
});
