/**
 * The Agent Pack expands, and a materialize that stopped can be resumed.
 *
 * Two decisions from the second G2 run meet in this file. The first is what an
 * artifact's bytes *are*: a scaffold is an archive, a managed bridge is the
 * file itself, and the Agent Pack is an archive too — a release's guides,
 * schemas and checklists are a directory, and writing a tar to `AGENTS.md`
 * puts an archive where a document belongs.
 *
 * The second is what happens when the writing stopped halfway. Before this, a
 * materialize that failed left the project permanently refused: every resume
 * hit a file that was already there and reported the target as not empty. The
 * fix is not to overwrite — that would make an interrupted install a way to
 * lose someone's work — but to compare. Same bytes, carry on; different bytes,
 * refuse and leave the file exactly as it was found.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInstall } from '../../src/kit/operations/install.js';
import { runResume } from '../../src/kit/operations/resume.js';
import { materializeTargets } from '../../src/kit/operations/shared.js';
import { expandArchive } from '../../src/kit/expand.js';
import { readAgentPackRecord } from '../../src/kit/agent-pack.js';
import { detectManagedDrift } from '../../src/kit/drift.js';
import { readInstalledLock } from '../../src/kit/installed-state.js';
import { sha256Digest } from '../../src/kit/digest.js';
import { isKitError, type KitError } from '../../src/kit/errors.js';
import type { ArtifactPort, KitAdapters } from '../../src/kit/ports.js';
import { buildTar, FakeKitWorld, FAKE_LICENSE_KEY } from './fake-world.js';

/** The 17 files the real Landing Kit pack ships, by shape. */
function seventeenFilePack(): Record<string, string>
{
    return {
        'agents-block.md': '# managed block\n',
        'manifest.json': '{ "schemaVersion": 1 }\n',
        'checklists/copy.json': '["copy"]\n',
        'checklists/production.json': '["production"]\n',
        'checklists/visual.json': '["visual"]\n',
        'examples/en-copy-form.json': '{ "locale": "en" }\n',
        'examples/ko-image-cta.json': '{ "locale": "ko" }\n',
        'guides/bootstrap.md': '# bootstrap\n',
        'guides/deploy.md': '# deploy\n',
        'guides/install.md': '# install\n',
        'guides/landing-add.md': '# landing add\n',
        'guides/recover.md': '# recover\n',
        'guides/variant-add.md': '# variant add\n',
        'guides/visual-review.md': '# visual review\n',
        'schemas/campaign-input.schema.json': '{ "type": "object" }\n',
        'schemas/completion-report.schema.json': '{ "type": "object" }\n',
        'schemas/work-contract.schema.json': '{ "type": "object" }\n',
    };
}

let root: string;
let target: string;

beforeEach(() =>
{
    root = mkdtempSync(join(tmpdir(), 'spfn-kit-pack-'));
    target = join(root, 'project');
});

afterEach(() =>
{
    rmSync(root, { recursive: true, force: true });
});

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

/** Serves one archive under one name, and counts what was asked for. */
function artifactsServing(entries: Record<string, Uint8Array>): ArtifactPort & { asked: string[] }
{
    const asked: string[] = [];

    return {
        asked,
        async fetch(artifact: string)
        {
            asked.push(artifact);

            const bytes = entries[artifact];

            if (bytes === undefined)
            {
                throw new Error(`no artifact ${artifact}`);
            }

            return bytes;
        },
    };
}

function adaptersWith(artifacts: ArtifactPort): KitAdapters
{
    return { ...new FakeKitWorld().adapters, artifacts };
}

describe('the Agent Pack is an archive the CLI expands', () =>
{
    it('writes every file of a seventeen-file pack, and no archive anywhere', async () =>
    {
        const files = seventeenFilePack();
        const world = new FakeKitWorld({ releases: [{ version: '1.0.0', sequence: 1, agentPackFiles: files }] });

        await runInstall(installRequest(world), world.adapters);

        const packRoot = join(target, '.spfn', 'agent-pack');

        for (const [path, content] of Object.entries(files))
        {
            expect(readFileSync(join(packRoot, path), 'utf8'), path).toBe(content);
        }

        expect(readdirSync(join(packRoot, 'guides'))).toHaveLength(7);
        // The manifest's own path holds nothing: a tree is not a document.
        expect(existsSync(join(target, 'AGENTS.md'))).toBe(false);
    });

    it('records what it expanded, so drift has something it can compare', async () =>
    {
        const files = seventeenFilePack();
        const world = new FakeKitWorld({ releases: [{ version: '1.0.0', sequence: 1, agentPackFiles: files }] });

        await runInstall(installRequest(world), world.adapters);

        const record = readAgentPackRecord(target);
        const lock = readInstalledLock(join(target, '.spfn', 'kit-lock.json'));

        expect(record?.root).toBe('.spfn/agent-pack');
        expect(Object.keys(record?.files ?? {})).toHaveLength(17);
        expect(record?.targetDigest).toBe(lock?.agentPack.targetDigest);
        expect(detectManagedDrift(target, lock!)).toEqual([]);
    });

    it('reports an edited pack file as drift, naming that file', async () =>
    {
        const world = new FakeKitWorld({
            releases: [{ version: '1.0.0', sequence: 1, agentPackFiles: seventeenFilePack() }],
        });

        await runInstall(installRequest(world), world.adapters);
        writeFileSync(join(target, '.spfn', 'agent-pack', 'guides', 'deploy.md'), '# edited\n', 'utf8');

        const drift = detectManagedDrift(target, readInstalledLock(join(target, '.spfn', 'kit-lock.json'))!);

        expect(drift.map(entry => entry.path)).toEqual(['.spfn/agent-pack/guides/deploy.md']);
    });

    it('refuses an archive whose entry would be written outside the project', async () =>
    {
        const escaping = buildTar({ 'x.md': 'x' }, { rename: () => '../../escaped.md' });
        const artifacts = artifactsServing({ 'pack.tar': escaping });
        const failed = await materializeTargets(adaptersWith(artifacts), target, [{
            path: 'AGENTS.md',
            artifact: 'pack.tar',
            targetDigest: sha256Digest(escaping),
            kind: 'tree',
            root: '.spfn/agent-pack',
        }]).catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_MANIFEST_INVALID');
        expect((failed as KitError).evidence.reason).toBe('escaping-entry-path');
        expect(existsSync(join(root, 'escaped.md'))).toBe(false);
    });

    it('refuses an archive entry that is a symlink rather than a file', async () =>
    {
        const linked = buildTar({ 'link': '' }, { typeFlag: '2' });
        const artifacts = artifactsServing({ 'pack.tar': linked });
        const failed = await materializeTargets(adaptersWith(artifacts), target, [{
            path: 'AGENTS.md',
            artifact: 'pack.tar',
            targetDigest: sha256Digest(linked),
            kind: 'tree',
            root: '.spfn/agent-pack',
        }]).catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_MANIFEST_INVALID');
        expect((failed as KitError).evidence.reason).toBe('unsupported-entry-type');
    });

    it('refuses an archive whose bytes are not the digest the manifest declared', async () =>
    {
        const artifacts = artifactsServing({ 'pack.tar': buildTar({ 'a.md': 'a' }) });
        const failed = await materializeTargets(adaptersWith(artifacts), target, [{
            path: 'AGENTS.md',
            artifact: 'pack.tar',
            targetDigest: sha256Digest('something else'),
            kind: 'tree',
            root: '.spfn/agent-pack',
        }]).catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_MANIFEST_INVALID');
        expect(existsSync(join(target, '.spfn', 'agent-pack'))).toBe(false);
    });
});

describe('a materialize that stopped can be resumed', () =>
{
    it('counts a file already holding exactly these bytes as done', () =>
    {
        const files = { 'guides/install.md': '# install\n', 'guides/deploy.md': '# deploy\n' };
        const archive = buildTar(files);

        // A first pass that stopped after one file.
        mkdirSync(join(target, 'pack', 'guides'), { recursive: true });
        writeFileSync(join(target, 'pack', 'guides', 'install.md'), files['guides/install.md'], 'utf8');

        const result = expandArchive(archive, { targetDir: target, root: 'pack', artifact: 'pack.tar' });

        expect(result.matched).toBe(1);
        expect(result.written).toBe(1);
        expect(readFileSync(join(target, 'pack', 'guides', 'deploy.md'), 'utf8')).toBe(files['guides/deploy.md']);
    });

    it('refuses a file holding something else, and leaves it alone', () =>
    {
        const archive = buildTar({ 'guides/install.md': '# install\n' });

        mkdirSync(join(target, 'pack', 'guides'), { recursive: true });
        writeFileSync(join(target, 'pack', 'guides', 'install.md'), '# mine\n', 'utf8');

        let failed: unknown;

        try
        {
            expandArchive(archive, { targetDir: target, root: 'pack', artifact: 'pack.tar' });
        }
        catch (error)
        {
            failed = error;
        }

        expect(isKitError(failed) && (failed as KitError).code).toBe('KIT_TARGET_NOT_EMPTY');
        expect((failed as KitError).evidence.path).toBe('pack/guides/install.md');
        expect(readFileSync(join(target, 'pack', 'guides', 'install.md'), 'utf8')).toBe('# mine\n');
    });

    it('replaces only when told to, which is what an update does', () =>
    {
        const archive = buildTar({ 'guides/install.md': '# install\n' });

        mkdirSync(join(target, 'pack', 'guides'), { recursive: true });
        writeFileSync(join(target, 'pack', 'guides', 'install.md'), '# the previous release\n', 'utf8');

        expandArchive(archive, { targetDir: target, root: 'pack', artifact: 'pack.tar', existing: 'replace' });

        expect(readFileSync(join(target, 'pack', 'guides', 'install.md'), 'utf8')).toBe('# install\n');
    });

    it('resumes an install whose materialize stopped part-way through', async () =>
    {
        const world = new FakeKitWorld({
            releases: [{ version: '1.0.0', sequence: 1, agentPackFiles: seventeenFilePack() }],
        });
        let failing = true;
        const artifacts = world.adapters.artifacts;
        const flaky: ArtifactPort = {
            async fetch(artifact: string)
            {
                // The pack is the last artifact the step fetches, so the run
                // stops with the scaffold and the bridges already written.
                if (failing && artifact.endsWith('agent-pack.tar'))
                {
                    throw new Error('the connection dropped');
                }

                return artifacts.fetch(artifact);
            },
        };

        await expect(runInstall(installRequest(world), { ...world.adapters, artifacts: flaky }))
            .rejects.toThrow(/connection dropped/);

        // Part of the tree is on disk, and the old behaviour refused forever.
        expect(existsSync(join(target, 'src', 'app', 'api', 'landing', 'route.ts'))).toBe(true);
        expect(existsSync(join(target, '.spfn', 'agent-pack'))).toBe(false);

        failing = false;

        const resumed = await runResume({
            projectDir: target,
            readLicenseKey: async () => FAKE_LICENSE_KEY,
            json: true,
            write: () => undefined,
        }, world.adapters);

        expect(resumed.status).toBe('completed');
        expect(Object.keys(readAgentPackRecord(target)?.files ?? {})).toHaveLength(17);
        // One activation: the resume did not consume a second project slot.
        expect(world.activationCalls).toHaveLength(1);
    });

    it('refuses to resume over a managed file somebody else changed', async () =>
    {
        const world = new FakeKitWorld();
        let failing = true;
        const artifacts = world.adapters.artifacts;
        const flaky: ArtifactPort = {
            async fetch(artifact: string)
            {
                if (failing && artifact.endsWith('agent-pack.tar'))
                {
                    throw new Error('the connection dropped');
                }

                return artifacts.fetch(artifact);
            },
        };

        await expect(runInstall(installRequest(world), { ...world.adapters, artifacts: flaky }))
            .rejects.toThrow(/connection dropped/);

        const bridge = join(target, 'src', 'app', 'api', 'landing', 'route.ts');

        writeFileSync(bridge, '// somebody edited this while the install was down\n', 'utf8');
        failing = false;

        const resumed = await runResume({
            projectDir: target,
            readLicenseKey: async () => FAKE_LICENSE_KEY,
            json: true,
            write: () => undefined,
        }, world.adapters);

        expect(resumed.status).toBe('failed');
        expect(resumed.code).toBe('KIT_TARGET_NOT_EMPTY');
        expect(readFileSync(bridge, 'utf8')).toBe('// somebody edited this while the install was down\n');
    });
});
