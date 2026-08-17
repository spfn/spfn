/**
 * "No package provides tooling" and "the tooling would not load" are different
 * facts, and the CLI used to report both as the first one.
 *
 * That is what the fourth G2 run walked into. The product's tooling entry was a
 * `.ts` file, Node refuses to strip types for anything under `node_modules`,
 * discovery caught the error, and the run was told the release had no tooling
 * at all — a `KIT_MANIFEST_INVALID` naming the manifest, when nothing was wrong
 * with the manifest. The cause was one line away and never travelled.
 *
 * Most of these load through the CLI's real project-module loader against
 * packages written to a temporary `node_modules`, because the distinction
 * being tested is a distinction between Node's own errors, and a hand-thrown
 * `Error` would prove only that the test author agreed with the
 * implementation. The one exception is the `.ts` case, and it says why.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverTooling, isMissingExport, toolingLoadFailure } from '../../src/kit/tooling.js';
import { createProjectModuleLoader } from '../../src/kit/local/index.js';
import { readManifest } from '../../src/kit/manifest.js';
import { isKitError, KIT_EXIT, type KitError } from '../../src/kit/errors.js';
import type { KitReleaseManifestView } from '../../src/kit/manifest.js';
import { FakeKitWorld } from './fake-world.js';

const KIT_ID = 'campaign-landing';

/** A tooling module that satisfies the contract, as a plain JS entry. */
const WORKING_TOOLING = `export default {
    kitId: ${JSON.stringify(KIT_ID)},
    async inspect() { return { kitId: ${JSON.stringify(KIT_ID)}, release: '1.0.0' }; },
    async planInstall() { return { kitId: ${JSON.stringify(KIT_ID)}, release: '1.0.0', entries: [] }; },
    async planUpdate() { return { kitId: ${JSON.stringify(KIT_ID)}, release: '1.0.0', entries: [] }; },
    async check() { return []; },
};
`;

let root: string;

beforeEach(() =>
{
    root = mkdtempSync(join(tmpdir(), 'spfn-kit-tooling-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'p', private: true, type: 'module' }), 'utf8');
});

afterEach(() =>
{
    rmSync(root, { recursive: true, force: true });
});

/** Write a package into the project's own `node_modules`. */
function installPackage(name: string, files: Record<string, string>, exportsMap: Record<string, string>): void
{
    const dir = join(root, 'node_modules', ...name.split('/'));

    mkdirSync(dir, { recursive: true });
    writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name, version: '1.0.0', type: 'module', exports: exportsMap }),
        'utf8',
    );

    for (const [file, contents] of Object.entries(files))
    {
        writeFileSync(join(dir, file), contents, 'utf8');
    }
}

/** A manifest that installs exactly the packages a case wrote. */
function manifestFor(names: string[]): KitReleaseManifestView
{
    const base = new FakeKitWorld({ kitId: KIT_ID }).latest.manifest as Record<string, unknown>;
    const template = (base.packages as Record<string, unknown>[])[0];

    return readManifest({
        ...base,
        packages: names.map(name => ({ ...template, name, version: '1.0.0' })),
    });
}

function discover(names: string[]): Promise<unknown>
{
    const loader = createProjectModuleLoader();

    return discoverTooling({
        manifest: manifestFor(names),
        load: specifier => loader(specifier, root),
    });
}

describe('discovering the package that speaks for this Kit', () =>
{
    it('loads a working JS tooling entry and names the specifier it came from', async () =>
    {
        installPackage('@superfunction/campaign-landing', { 'tooling.js': WORKING_TOOLING }, {
            '.': './tooling.js',
            './tooling': './tooling.js',
        });

        const discovered = await discover(['@superfunction/campaign-landing']) as { specifier: string };

        expect(discovered.specifier).toBe('@superfunction/campaign-landing/tooling');
    });

    it('passes over a package that simply has no tooling export', async () =>
    {
        installPackage('@spfn/core', { 'index.js': 'export default 1;\n' }, { '.': './index.js' });
        installPackage('@superfunction/campaign-landing', { 'tooling.js': WORKING_TOOLING }, {
            '.': './tooling.js',
            './tooling': './tooling.js',
        });

        const discovered = await discover(['@spfn/core', '@superfunction/campaign-landing']) as { specifier: string };

        expect(discovered.specifier).toBe('@superfunction/campaign-landing/tooling');
    });

    it('still says the manifest offers no tooling when genuinely none does', async () =>
    {
        installPackage('@spfn/core', { 'index.js': 'export default 1;\n' }, { '.': './index.js' });

        const failed = await discover(['@spfn/core']).catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_MANIFEST_INVALID');
        expect((failed as KitError).evidence.candidates).toBe(0);
    });

    /**
     * The G2 case itself, tested at the classification boundary rather than
     * end to end — and deliberately so. Under Vitest a `.ts` file is
     * transformed by the bundler and simply loads, so the runtime this test
     * runs in cannot produce the refusal the runtime a customer runs in does.
     * What can be reproduced exactly is the error Node raises, captured here
     * verbatim, and that is the input the fix actually reads.
     */
    it('reports a TypeScript entry Node will not strip as a load failure, with its cause', () =>
    {
        const specifier = '@superfunction/campaign-landing/tooling';
        const error = Object.assign(
            new Error('Stripping types is currently unsupported for files under node_modules, for '
                + '"file:///Users/someone/app/node_modules/@superfunction/campaign-landing/tooling.ts"'),
            { code: 'ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING' },
        );

        expect(isMissingExport(error, specifier, '@superfunction/campaign-landing')).toBe(false);

        const failure = toolingLoadFailure(error, specifier);

        expect(failure.code).toBe('CLI_TOOLING_LOAD_FAILED');
        expect(failure.evidence.cause).toBe('ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING');
        expect(failure.evidence.specifier).toBe(specifier);
        // Exit 4: go and fix the package, not exit 5's "try again later".
        expect(failure.exitCode).toBe(KIT_EXIT.REFUSED);
        // The cause survives; the machine it happened on does not.
        expect(String(failure.evidence.detail)).toContain('Stripping types');
        expect(String(failure.evidence.detail)).not.toContain('/Users/someone');
        expect(String(failure.evidence.detail)).toContain('<path>');
    });

    it('reports a JS entry that does not parse as a load failure too', async () =>
    {
        installPackage('@superfunction/campaign-landing', {
            'tooling.js': 'export default { kitId: "campaign-landing" ;;; not javascript\n',
        }, { '.': './tooling.js', './tooling': './tooling.js' });

        const failed = await discover(['@superfunction/campaign-landing']).catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('CLI_TOOLING_LOAD_FAILED');
        // A syntax error carries no `code` of its own, so the message is the
        // only thing that says what happened — which is why it travels at all.
        expect((failed as KitError).evidence.cause).toBe('unknown');
        expect(String((failed as KitError).evidence.detail)).toContain('Unexpected token');
    });

    it('reports a tooling entry whose own import is missing, rather than skipping it', async () =>
    {
        // `ERR_MODULE_NOT_FOUND`, but for something other than the specifier
        // asked for: the entry point loaded and its dependency did not.
        installPackage('@superfunction/campaign-landing', {
            'tooling.js': 'import "./not-written.js";\nexport default {};\n',
        }, { '.': './tooling.js', './tooling': './tooling.js' });

        const failed = await discover(['@superfunction/campaign-landing']).catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('CLI_TOOLING_LOAD_FAILED');
    });

    it('never puts a path from this machine into the failure it reports', async () =>
    {
        installPackage('@superfunction/campaign-landing', {
            'tooling.js': 'import "./not-written.js";\nexport default {};\n',
        }, { '.': './tooling.js', './tooling': './tooling.js' });

        const failed = await discover(['@superfunction/campaign-landing']).catch(error => error as KitError);
        const evidence = JSON.stringify((failed as KitError).evidence);

        expect((failed as KitError).code).toBe('CLI_TOOLING_LOAD_FAILED');
        expect(evidence).not.toContain(root);
        expect(evidence).not.toContain('node_modules/');
        // The stack is where a path would hide, and it does not travel.
        expect(evidence).not.toContain('\n');
    });
});
