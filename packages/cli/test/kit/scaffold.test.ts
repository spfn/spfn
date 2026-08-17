/**
 * Expanding a release's scaffold onto a real filesystem.
 *
 * These run against temporary directories rather than an in-memory fake,
 * because the properties being proved are filesystem properties: that a `..`
 * entry does not land outside the target, that a refused archive leaves nothing
 * behind, and that the file the project ends up with is the file the release
 * published. A fake filesystem can be made to agree with any of those.
 */

import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArtifactScaffoldPort, packageNameOf, readScaffoldRecord } from '../../src/kit/scaffold.js';
import { readTar, TarFormatError } from '../../src/kit/tar.js';
import { isKitError } from '../../src/kit/errors.js';
import type { ArtifactPort } from '../../src/kit/ports.js';
import { buildTar, defaultScaffoldFiles, sriOf } from './fake-world.js';

let root: string;
let target: string;

beforeEach(() =>
{
    root = mkdtempSync(join(tmpdir(), 'spfn-kit-scaffold-'));
    target = join(root, 'project');
    mkdirSync(target, { recursive: true });
});

afterEach(() =>
{
    rmSync(root, { recursive: true, force: true });
});

/** A release store that serves exactly one archive, under one name. */
function artifactsServing(name: string, bytes: Uint8Array): ArtifactPort
{
    return {
        async fetch(artifact: string)
        {
            if (artifact !== name)
            {
                throw new Error(`no artifact ${artifact}`);
            }

            return bytes;
        },
    };
}

async function expand(files: Record<string, string | Uint8Array>, options: {
    integrity?: string;
    name?: string;
    overrides?: Parameters<typeof buildTar>[1];
} = {}): Promise<void>
{
    const bytes = buildTar(files, options.overrides);
    const port = new ArtifactScaffoldPort({ artifacts: artifactsServing('scaffold.tar', bytes) });

    await port.createBase({
        targetDir: target,
        name: options.name ?? 'My Landing Project',
        scaffold: { recipeVersion: '1.0.0', artifact: 'scaffold.tar', integrity: options.integrity ?? sriOf(bytes) },
    });
}

describe('the tar reader', () =>
{
    it('reads back what was written, byte for byte', () =>
    {
        const files = { 'a.txt': 'first\n', 'nested/deep/b.bin': Buffer.from([0, 1, 2, 255]) };
        const entries = readTar(buildTar(files));

        expect(entries.map(entry => entry.path)).toEqual(['a.txt', 'nested/deep/b.bin']);
        expect(Buffer.from(entries[0].bytes).toString('utf8')).toBe('first\n');
        expect([...entries[1].bytes]).toEqual([0, 1, 2, 255]);
    });

    it('refuses a path that would leave the project', () =>
    {
        const archive = buildTar({ 'x.txt': 'x' }, { rename: () => '../escaped.txt' });

        expect(() => readTar(archive)).toThrow(TarFormatError);
    });

    it('refuses an absolute path', () =>
    {
        expect(() => readTar(buildTar({ 'x.txt': 'x' }, { rename: () => '/etc/passwd' }))).toThrow(/absolute/i);
    });

    it('refuses an entry that is neither a file nor a directory', () =>
    {
        expect(() => readTar(buildTar({ 'link': '' }, { typeFlag: '2' }))).toThrow(/neither a file nor a directory/);
    });

    it('stops at the end-of-archive blocks rather than reading past them', () =>
    {
        const archive = Buffer.concat([Buffer.from(buildTar({ 'a.txt': 'a' })), Buffer.from('trailing garbage')]);

        expect(readTar(new Uint8Array(archive)).map(entry => entry.path)).toEqual(['a.txt']);
    });
});

describe('scaffold materialization', () =>
{
    it('writes the release\'s base onto the filesystem', async () =>
    {
        await expand(defaultScaffoldFiles('1.0.0'));

        expect(existsSync(join(target, 'src', 'app', 'page.tsx'))).toBe(true);
        expect(readFileSync(join(target, 'pnpm-lock.yaml'), 'utf8')).toBe('lockfileVersion: 9.0\n');
    });

    it('seeds the project\'s own name into the scaffold\'s package.json', async () =>
    {
        await expand(defaultScaffoldFiles('1.0.0'), { name: 'My Landing Project' });

        const parsed = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));

        expect(parsed.name).toBe('my-landing-project');
        // Everything else the release published is left exactly as it was.
        expect(parsed.private).toBe(true);
        expect(parsed.version).toBe('0.0.0');
    });

    it('records what produced the base, with a digest of the expanded tree', async () =>
    {
        const files = defaultScaffoldFiles('1.0.0');

        await expand(files);

        const record = readScaffoldRecord(target);

        expect(record?.recipeVersion).toBe('1.0.0');
        expect(record?.files).toBe(Object.keys(files).length);
        expect(record?.treeDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it('expands nothing when the archive does not match its declared integrity', async () =>
    {
        await expect(expand(defaultScaffoldFiles('1.0.0'), { integrity: sriOf(Buffer.from('something else')) }))
            .rejects.toMatchObject({ code: 'KIT_MANIFEST_INVALID' });

        expect(readdirSync(target)).toHaveLength(0);
    });

    it('refuses an integrity algorithm it cannot verify', async () =>
    {
        await expect(expand(defaultScaffoldFiles('1.0.0'), { integrity: 'md5-abcdef' }))
            .rejects.toMatchObject({ code: 'KIT_MANIFEST_INVALID' });
    });

    it('refuses an archive that would write outside the project, before writing anything', async () =>
    {
        const escaping = expand(
            { 'safe.txt': 'safe', 'evil.txt': 'evil' },
            { overrides: { rename: (path: string) => path === 'evil.txt' ? '../evil.txt' : path } },
        );

        await expect(escaping).rejects.toMatchObject({ code: 'KIT_MANIFEST_INVALID' });
        expect(existsSync(join(root, 'evil.txt'))).toBe(false);
        expect(readdirSync(target)).toHaveLength(0);
    });

    it('refuses to overwrite a file the project already has', async () =>
    {
        writeFileSync(join(target, 'pnpm-lock.yaml'), 'someone else wrote this\n', 'utf8');

        await expect(expand(defaultScaffoldFiles('1.0.0'))).rejects.toMatchObject({ code: 'KIT_TARGET_NOT_EMPTY' });
        expect(readFileSync(join(target, 'pnpm-lock.yaml'), 'utf8')).toBe('someone else wrote this\n');
    });

    it('refuses a release that declares no scaffold at all', async () =>
    {
        const port = new ArtifactScaffoldPort({ artifacts: artifactsServing('scaffold.tar', new Uint8Array()) });
        const failed = await port.createBase({ targetDir: target, name: 'x' }).catch(error => error);

        expect(isKitError(failed) && failed.code).toBe('KIT_MANIFEST_INVALID');
    });

    it('turns a directory name into a name npm would accept', () =>
    {
        expect(packageNameOf('My Landing Project')).toBe('my-landing-project');
        expect(packageNameOf('--weird--')).toBe('weird');
        expect(packageNameOf('!!!')).toBe('kit-project');
    });
});
