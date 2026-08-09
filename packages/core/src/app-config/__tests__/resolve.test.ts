/**
 * Which port and host each process binds.
 *
 * Three layers and no more — environment, spfn.config.js, default — with the
 * default existing in exactly one place. The tables below are the design's own
 * case tables; each row was a way the old four-layer chain could surprise
 * someone, and one of them (a hardcoded value beating the app's own config) is
 * a defect that shipped.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
    loadAppConfig,
    resolvePorts,
    resolveHost,
    resolveServerAddress,
    PORT_DEFAULTS,
    HOST_DEFAULT,
} from '../index';

let fixture: string;

function writeConfig(body: string): void
{
    writeFileSync(join(fixture, 'spfn.config.js'), body);
}

beforeEach(() =>
{
    fixture = mkdtempSync(join(tmpdir(), 'spfn-app-config-'));
});

afterEach(() =>
{
    rmSync(fixture, { recursive: true, force: true });
});

describe('loading spfn.config.js', () =>
{
    it('reads the ports an app declared', async () =>
    {
        writeConfig('export default { ports: { next: 3890, server: 8890 } };');

        const config = await loadAppConfig(fixture);

        expect(config.ports).toEqual({ next: 3890, server: 8890 });
    });

    it('returns an empty config when the app has no file', async () =>
    {
        expect(await loadAppConfig(fixture)).toEqual({});
    });

    it('returns an empty config rather than refusing to boot on a broken file', async () =>
    {
        writeConfig('export default { this is not javascript');

        expect(await loadAppConfig(fixture)).toEqual({});
    });

    it('says so when it falls back, because a broken file is a typo and not an absence', async () =>
    {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        writeConfig('export default { this is not javascript');
        await loadAppConfig(fixture);

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('spfn.config.js'));
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('defaults'));

        warn.mockRestore();
    });

    it('stays quiet when there is simply no file', async () =>
    {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        await loadAppConfig(fixture);

        expect(warn).not.toHaveBeenCalled();

        warn.mockRestore();
    });
});

describe('port resolution', () =>
{
    const cases: Array<{
        name: string;
        env: NodeJS.ProcessEnv;
        config: Parameters<typeof resolvePorts>[0];
        expected: { next: number; server: number };
    }> = [
        {
            name: 'nothing set — the single default',
            env: {},
            config: {},
            expected: { next: PORT_DEFAULTS.next, server: PORT_DEFAULTS.server },
        },
        {
            name: 'spfn.config.js alone',
            env: {},
            config: { ports: { next: 3890, server: 8890 } },
            expected: { next: 3890, server: 8890 },
        },
        {
            name: 'environment overrides the file',
            env: { NEXT_PORT: '3900', SPFN_PORT: '9000' },
            config: { ports: { next: 3890, server: 8890 } },
            expected: { next: 3900, server: 9000 },
        },
        {
            name: 'environment alone',
            env: { SPFN_PORT: '9000' },
            config: {},
            expected: { next: PORT_DEFAULTS.next, server: 9000 },
        },
        {
            name: 'one port configured, the other left to the default',
            env: {},
            config: { ports: { server: 8890 } },
            expected: { next: PORT_DEFAULTS.next, server: 8890 },
        },
        {
            name: 'an unusable environment value falls through instead of binding NaN',
            env: { SPFN_PORT: 'not-a-port' },
            config: { ports: { server: 8890 } },
            expected: { next: PORT_DEFAULTS.next, server: 8890 },
        },
        {
            name: 'an out-of-range port falls through too',
            env: { SPFN_PORT: '70000' },
            config: {},
            expected: { next: PORT_DEFAULTS.next, server: PORT_DEFAULTS.server },
        },
    ];

    for (const testCase of cases)
    {
        it(testCase.name, () =>
        {
            expect(resolvePorts(testCase.config, testCase.env)).toEqual(testCase.expected);
        });
    }
});

describe('host resolution', () =>
{
    it('defaults to localhost so a dev machine does not publish to its network', () =>
    {
        expect(resolveHost({}, {})).toBe(HOST_DEFAULT);
    });

    it('takes the configured host', () =>
    {
        expect(resolveHost({ host: '0.0.0.0' }, {})).toBe('0.0.0.0');
    });

    it('lets the environment override it, which is how a container binds', () =>
    {
        expect(resolveHost({ host: 'localhost' }, { SPFN_HOST: '0.0.0.0' })).toBe('0.0.0.0');
    });
});

describe('the deprecated .port() / .host() during their last release', () =>
{
    it('is used when spfn.config.js says nothing', () =>
    {
        const address = resolveServerAddress({}, { port: 8890, host: '0.0.0.0' }, {});

        expect(address).toEqual({ port: 8890, host: '0.0.0.0' });
    });

    it('loses to spfn.config.js, which is where the address moved', () =>
    {
        const address = resolveServerAddress(
            { ports: { server: 9100 }, host: '127.0.0.1' },
            { port: 8890, host: '0.0.0.0' },
            {},
        );

        expect(address).toEqual({ port: 9100, host: '127.0.0.1' });
    });

    it('loses to the environment as well', () =>
    {
        const address = resolveServerAddress(
            {},
            { port: 8890 },
            { SPFN_PORT: '9000' },
        );

        expect(address.port).toBe(9000);
    });

    it('falls back to the single default when nothing is set anywhere', () =>
    {
        expect(resolveServerAddress({}, {}, {})).toEqual({
            port: PORT_DEFAULTS.server,
            host: HOST_DEFAULT,
        });
    });
});
