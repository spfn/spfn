/**
 * Where `@spfn/auth/crypto` is loaded from.
 *
 * The CLI does not depend on `@spfn/auth` in any form; it borrows the app's.
 * Which app, though, is decided by where resolution starts — and the documented
 * way to run this CLI (`npx spfn@beta`) unpacks it into the npx cache, nowhere
 * near the app. Resolution therefore starts at the directory the command runs
 * in, and these tests pin that along with the two failures the operator is told
 * apart: a package that is absent, and one too old to carry the entry point.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Module from 'node:module';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAuthCrypto } from '../ops/auth-crypto.js';

let appDir: string;
let originalCwd: string;
let originalNodePath: string | undefined;

/**
 * Take the test runner's `NODE_PATH` out of the picture.
 *
 * vitest sets it to pnpm's hoisted store, and CommonJS resolution consults it
 * after the directory walk — so a temp app with nothing installed would still
 * find this monorepo's own `@spfn/auth` and the absent-package case could never
 * be observed. Nothing sets `NODE_PATH` for a real `spfn` run. The paths are
 * recomputed from the variable, which is why clearing it alone is not enough.
 */
function withoutInheritedNodePath(): void
{
    originalNodePath = process.env.NODE_PATH;
    delete process.env.NODE_PATH;
    (Module as unknown as { _initPaths(): void })._initPaths();
}

function restoreNodePath(): void
{
    if (originalNodePath === undefined)
    {
        delete process.env.NODE_PATH;
    }
    else
    {
        process.env.NODE_PATH = originalNodePath;
    }

    (Module as unknown as { _initPaths(): void })._initPaths();
}

/** An app directory with `@spfn/auth` installed, exporting what is asked for. */
function installAuth(exports: Record<string, string>, files: Record<string, string> = {}): void
{
    const pkgDir = join(appDir, 'node_modules', '@spfn', 'auth');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
        name: '@spfn/auth',
        version: '0.0.0-test',
        type: 'module',
        exports,
    }));

    for (const [name, source] of Object.entries(files))
    {
        writeFileSync(join(pkgDir, name), source);
    }
}

beforeEach(() =>
{
    originalCwd = process.cwd();
    appDir = mkdtempSync(join(tmpdir(), 'spfn-ops-auth-'));
    writeFileSync(join(appDir, 'package.json'), JSON.stringify({ name: 'an-app', type: 'module' }));
    process.chdir(appDir);
    withoutInheritedNodePath();
});

afterEach(() =>
{
    restoreNodePath();
    process.chdir(originalCwd);
    rmSync(appDir, { recursive: true, force: true });
});

describe('loadAuthCrypto', () =>
{
    it("loads the app's package even though the CLI lives elsewhere", async () =>
    {
        installAuth(
            { './crypto': './crypto.js' },
            { 'crypto.js': 'export const generateKeyPair = () => ({}); export const generateClientToken = () => "";' },
        );

        const crypto = await loadAuthCrypto();

        expect(typeof crypto.generateKeyPair).toBe('function');
        expect(typeof crypto.generateClientToken).toBe('function');
    });

    it('names the directory it looked in when the package is absent', async () =>
    {
        // Before resolution moved to the app, this was what an `npx` run got
        // even when the app did have the package — the operator was sent to
        // install what they already had.
        await expect(loadAuthCrypto()).rejects.toThrow(/No @spfn\/auth is installed in/);
    });

    it('tells an older package apart from a missing one', async () =>
    {
        installAuth({ '.': './index.js' }, { 'index.js': 'export const x = 1;' });

        await expect(loadAuthCrypto()).rejects.toThrow(/older than 0\.3\.0-beta\.2/);
    });
});
