/**
 * What a production server actually reads as its configuration.
 *
 * `spfn build` compiles src/server/ with tsup, and tsup names the output from
 * the app's package.json: `.mjs` normally, `.js` when the app declares
 * `"type": "module"`. The lookup used to list only `.mjs`, so an app with that
 * declaration started with an empty configuration — no middlewares, no routes,
 * no infrastructure switches — and said so only at debug level. These tests fix
 * both extensions in place and assert the report that would have made it
 * visible.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { loadAndMergeConfig } from '../start-server';
import { serverLogger } from '../logger';

let fixture: string;

function writeCompiledConfig(fileName: string, body: string): void
{
    const outDir = join(fixture, '.spfn', 'server');

    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, fileName), body);
}

function writeAuthoredConfig(): void
{
    const srcDir = join(fixture, 'src', 'server');

    mkdirSync(srcDir, { recursive: true });
    writeFileSync(
        join(srcDir, 'server.config.ts'),
        "import { defineServerConfig } from '@/server/nowhere';\nexport default defineServerConfig().build();\n",
    );
}

beforeEach(() =>
{
    fixture = mkdtempSync(join(tmpdir(), 'spfn-config-'));
});

afterEach(() =>
{
    rmSync(fixture, { recursive: true, force: true });
    vi.restoreAllMocks();
});

describe('compiled server config lookup', () =>
{
    it('loads the config tsup emits for an app declaring "type": "module"', async () =>
    {
        writeCompiledConfig(
            'server.config.js',
            'export default { port: 4321, infrastructure: { database: false } };',
        );

        const config = await loadAndMergeConfig(undefined, fixture);

        expect(config.port).toBe(4321);
        expect(config.infrastructure?.database).toBe(false);
    });

    it('loads the config tsup emits for an app without that declaration', async () =>
    {
        writeCompiledConfig(
            'server.config.mjs',
            'export default { port: 4322, infrastructure: { redis: false } };',
        );

        const config = await loadAndMergeConfig(undefined, fixture);

        expect(config.port).toBe(4322);
        expect(config.infrastructure?.redis).toBe(false);
    });

    it('prefers .mjs when a stale build left both behind', async () =>
    {
        writeCompiledConfig('server.config.mjs', 'export default { port: 4323 };');
        writeCompiledConfig('server.config.js', 'export default { port: 9999 };');

        const config = await loadAndMergeConfig(undefined, fixture);

        expect(config.port).toBe(4323);
    });

    it('lets an explicit argument win over the file', async () =>
    {
        writeCompiledConfig('server.config.mjs', 'export default { port: 4324, debug: true };');

        const config = await loadAndMergeConfig({ port: 5555 }, fixture);

        expect(config.port).toBe(5555);
        expect(config.debug).toBe(true);
    });
});

describe('reporting a configuration that was authored but not loaded', () =>
{
    it('warns when src/server/server.config.ts exists and nothing was loaded', async () =>
    {
        const warn = vi.spyOn(serverLogger, 'warn').mockImplementation(() => undefined);

        writeAuthoredConfig();

        await loadAndMergeConfig(undefined, fixture);

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('src/server/server.config.ts');
        expect(warn.mock.calls[0][0]).toContain('running on defaults');
    });

    it('stays quiet when the compiled config was found', async () =>
    {
        const warn = vi.spyOn(serverLogger, 'warn').mockImplementation(() => undefined);

        writeAuthoredConfig();
        writeCompiledConfig('server.config.js', 'export default { port: 4325 };');

        const config = await loadAndMergeConfig(undefined, fixture);

        expect(config.port).toBe(4325);
        expect(warningsAbout(warn, 'running on defaults')).toHaveLength(0);
    });

    it('stays quiet for an app that authored no configuration at all', async () =>
    {
        const warn = vi.spyOn(serverLogger, 'warn').mockImplementation(() => undefined);

        await loadAndMergeConfig(undefined, fixture);

        expect(warn).not.toHaveBeenCalled();
    });
});

describe('reporting an address that moved to spfn.config.js', () =>
{
    it('warns once when a config still carries .port() or .host()', async () =>
    {
        const warn = vi.spyOn(serverLogger, 'warn').mockImplementation(() => undefined);

        writeCompiledConfig(
            'server.config.mjs',
            "export default { port: 4326, host: '0.0.0.0' };",
        );

        const config = await loadAndMergeConfig(undefined, fixture);

        // Still honoured — deprecated means one more release, not removed.
        expect(config.port).toBe(4326);
        expect(config.host).toBe('0.0.0.0');

        const deprecations = warningsAbout(warn, 'deprecated');

        expect(deprecations).toHaveLength(1);
        expect(deprecations[0]).toContain('.port() and .host()');
        expect(deprecations[0]).toContain('spfn.config.js');
    });

    it('says nothing to an app that carries no address at all', async () =>
    {
        const warn = vi.spyOn(serverLogger, 'warn').mockImplementation(() => undefined);

        writeCompiledConfig('server.config.mjs', 'export default { debug: true };');

        await loadAndMergeConfig(undefined, fixture);

        expect(warningsAbout(warn, 'deprecated')).toHaveLength(0);
    });
});

/**
 * Structural, not `ReturnType<typeof vi.spyOn>`: that type carries a construct
 * signature the logger's overloaded `warn` does not satisfy, so every call site
 * failed to type-check. All this needs is the recorded arguments.
 */
function warningsAbout(
    warn: { mock: { calls: unknown[][] } },
    fragment: string,
): string[]
{
    return warn.mock.calls
        .map(call => String(call[0]))
        .filter(message => message.includes(fragment));
}
