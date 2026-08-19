/**
 * Unit 10 table D — the restore and recovery half.
 *
 * D5 (a same-machine clean clone restores), D6 and D7 (a machine with an empty
 * keychain recovers through the address of record and then restores) and D8
 * (the machine that held the previous credential is stale afterwards), plus
 * the isolated keychain namespace unit 10 §1.3 makes a supported input.
 *
 * The G5 run proves the same cells against a real control plane, a real
 * keychain and a real message; what is here is the same table, deterministic.
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

describe('D5 — a same-machine clean clone restores from the committed state', () =>
{
    it('reinstalls the exact release and passes the gates', async () =>
    {
        const world = new FakeKitWorld({ releases: [R0] });

        await install(world);

        const clone = cleanClone();
        const result = await runRestore({ projectDir: clone, json: true, write: silent }, world.adapters);

        expect(result.status).toBe('completed');
        expect(result.code).toBe('KIT_RESTORE_COMPLETE');
        expect(readInstalledLock(join(clone, '.spfn', 'kit-lock.json'))?.release).toBe('1.0.0');
    });
});

describe('D6, D7, D8 — the recovered machine, and the machine it replaced', () =>
{
    it('D6: an empty keychain sends the clone to recover rather than to a second activation', async () =>
    {
        const world = new FakeKitWorld({ releases: [R0] });

        await install(world);

        const clone = cleanClone();

        world.credentials.items.clear();

        const failure = await runRestore({ projectDir: clone, json: true, write: silent }, world.adapters);

        expect(failure.status).toBe('failed');
        expect(failure.code).toBe('KIT_CREDENTIAL_MISSING');
        expect(failure.next?.command).toContain('recover');
        expect(world.activationCalls.length).toBe(1);
    });

    it('D6: recover asks for a challenge, waits, and says nothing about whether the activation exists', async () =>
    {
        const world = new FakeKitWorld({ releases: [R0] });

        await install(world);

        const clone = cleanClone();

        world.credentials.items.clear();

        const result = await runRecover({ projectDir: clone, json: true, write: silent }, world.adapters);

        expect(result.status).toBe('waiting');
        expect(result.exitCode).toBe(KIT_EXIT.INPUT_REQUIRED);
        expect(result.code).toBe('KIT_RECOVERY_CHALLENGE_REQUIRED');
        expect(result.evidence?.input).toBe('masked-stdin');
        expect(result.next?.command).toContain('--recovery-challenge-stdin');
        expect(world.mailbox.length).toBe(1);
        // The challenge went to the address of record and nowhere else.
        expect(JSON.stringify(result.events)).not.toContain(world.mailbox[0].challenge);
    });

    it('D7: completing the recovery puts a new current credential on this machine and restores', async () =>
    {
        const world = new FakeKitWorld({ releases: [R0] });

        await install(world);

        const clone = cleanClone();

        world.credentials.items.clear();
        await runRecover({ projectDir: clone, json: true, write: silent }, world.adapters);

        const challenge = world.mailbox[0].challenge;
        const recovered = await runRecover({
            projectDir: clone,
            json: true,
            write: silent,
            readChallenge: async () => challenge,
        }, world.adapters);

        expect(recovered.status).toBe('completed');
        expect(recovered.code).toBe('KIT_RECOVERY_COMPLETE');
        expect(JSON.stringify(recovered.events)).not.toContain(challenge);

        const license = readLicenseFile(join(clone, '.spfn', 'license.json'))!;
        const stored = await world.credentials.read({
            kitId: license.kitId,
            activationId: license.activationId,
            localClientId: license.localClientId,
        });

        expect(stored).not.toBeNull();
        expect(stored?.generation).toBeGreaterThan(1);

        const restored = await runRestore({ projectDir: clone, json: true, write: silent }, world.adapters);

        expect(restored.status).toBe('completed');
        // Recovery replaces a credential; it does not take a second slot.
        expect(world.activationCalls.length).toBe(1);
    });

    it('a wrong or spent challenge changes nothing', async () =>
    {
        const world = new FakeKitWorld({ releases: [R0] });

        await install(world);

        const clone = cleanClone();

        world.credentials.items.clear();
        await runRecover({ projectDir: clone, json: true, write: silent }, world.adapters);

        const wrong = await failureOf(async () => runRecover({
            projectDir: clone,
            json: true,
            write: silent,
            readChallenge: async () => 'spfnr_0000000000000000.not-the-one-that-was-mailed-aaaaaaaaaaaaa',
        }, world.adapters));

        expect(wrong.code).toBe('CLI_RECOVERY_INVALID');
        expect(wrong.exitCode).toBe(KIT_EXIT.REFUSED);
        expect(world.credentials.items.size).toBe(0);

        const challenge = world.mailbox[0].challenge;

        await runRecover({ projectDir: clone, json: true, write: silent, readChallenge: async () => challenge }, world.adapters);

        // Single use: the same challenge a second time is no longer one this
        // activation can spend.
        const spent = await failureOf(async () => runRecover({
            projectDir: clone,
            json: true,
            write: silent,
            readChallenge: async () => challenge,
        }, world.adapters));

        expect(spent.code).toBe('CLI_RECOVERY_INVALID');
    });

    it('D8: the machine that held the previous credential is stale afterwards', async () =>
    {
        const world = new FakeKitWorld({ releases: [R0] });

        await install(world);

        const oldMachine = cleanClone('old-machine');
        const newMachine = cleanClone('new-machine');
        const license = readLicenseFile(join(target, '.spfn', 'license.json'))!;
        const identity = {
            kitId: license.kitId,
            activationId: license.activationId,
            localClientId: license.localClientId,
        };
        const before = await world.credentials.read(identity);

        // The new machine starts with nothing and recovers.
        world.credentials.items.clear();
        await runRecover({ projectDir: newMachine, json: true, write: silent }, world.adapters);
        await runRecover({
            projectDir: newMachine,
            json: true,
            write: silent,
            readChallenge: async () => world.mailbox[0].challenge,
        }, world.adapters);

        expect(await runRestore({ projectDir: newMachine, json: true, write: silent }, world.adapters))
            .toMatchObject({ status: 'completed' });

        // The old machine still holds what it always held.
        await world.credentials.save(identity, before!);

        const failure = await runRestore({ projectDir: oldMachine, json: true, write: silent }, world.adapters);

        expect(failure.status).toBe('failed');
        expect(failure.code).toBe('KIT_CREDENTIAL_STALE');
        expect(failure.exitCode).toBe(KIT_EXIT.REFUSED);
        expect(failure.next?.command).toContain('recover');
    });
});

describe('the isolated keychain namespace a recovered-machine run needs', () =>
{
    const saved = process.env[KIT_KEYCHAIN_NAMESPACE_ENV];

    afterEach(() =>
    {
        if (saved === undefined)
        {
            delete process.env[KIT_KEYCHAIN_NAMESPACE_ENV];
        }
        else
        {
            process.env[KIT_KEYCHAIN_NAMESPACE_ENV] = saved;
        }
    });

    it('appends under the Kit service and never replaces it', () =>
    {
        expect(kitKeychainService({})).toBe(KIT_KEYCHAIN_SERVICE);
        expect(kitKeychainService({ [KIT_KEYCHAIN_NAMESPACE_ENV]: 'i7-new-machine' }))
            .toBe(`${KIT_KEYCHAIN_SERVICE}.i7-new-machine`);
    });

    it('refuses a value it cannot use rather than falling back to the real namespace', () =>
    {
        // Falling back is how a "new machine" run would quietly read the old
        // machine's credential and report a pass.
        expect(() => kitKeychainService({ [KIT_KEYCHAIN_NAMESPACE_ENV]: '../../spfn' })).toThrowError();
        expect(() => kitKeychainService({ [KIT_KEYCHAIN_NAMESPACE_ENV]: 'Has Spaces' })).toThrowError();
    });
});
