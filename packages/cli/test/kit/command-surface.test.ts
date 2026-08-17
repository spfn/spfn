/**
 * The public surface of `spfn kit`, and the promises that are part of it
 * (unit 06 sections 8 and table F).
 *
 * The snapshot test is not decoration: an option that appears here later is a
 * public contract an agent will start relying on, and an option that quietly
 * accepts a secret on the command line is a leak that no amount of careful
 * internal handling can undo.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Command } from 'commander';
import { kitCommand } from '../../src/commands/kit/index.js';
import { setKitAdapterFactory } from '../../src/kit/adapters.js';
import { KIT_EXIT } from '../../src/kit/errors.js';
import { FakeKitWorld, FAKE_LICENSE_KEY } from './fake-world.js';

let root: string;
let target: string;
let stdout: string[];
let originalWrite: typeof process.stdout.write;
let originalLog: typeof console.log;

beforeEach(() =>
{
    root = mkdtempSync(join(tmpdir(), 'spfn-kit-cli-'));
    target = join(root, 'project');
    stdout = [];
    originalWrite = process.stdout.write.bind(process.stdout);
    originalLog = console.log;
    process.stdout.write = ((chunk: string | Uint8Array) =>
    {
        stdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));

        return true;
    }) as typeof process.stdout.write;
    console.log = (...parts: unknown[]) => stdout.push(`${parts.join(' ')}\n`);
    process.exitCode = undefined;
});

afterEach(() =>
{
    process.stdout.write = originalWrite;
    console.log = originalLog;
    process.exitCode = undefined;
    setKitAdapterFactory(null);
    rmSync(root, { recursive: true, force: true });
});

function subcommand(name: string): Command
{
    const found = kitCommand.commands.find(command => command.name() === name);

    if (!found)
    {
        throw new Error(`spfn kit has no ${name} command`);
    }

    return found;
}

function optionsOf(name: string): string[]
{
    return subcommand(name).options.map(option => option.long ?? option.short ?? '').sort();
}

function jsonEvents(): Record<string, any>[]
{
    return stdout
        .join('')
        .split('\n')
        .filter(line => line.trim().startsWith('{'))
        .map(line => JSON.parse(line));
}

describe('the command surface', () =>
{
    it('exposes exactly the Wave 1 commands', () =>
    {
        expect(kitCommand.commands.map(command => command.name()).sort()).toEqual([
            'abandon',
            'check',
            'install',
            'plan',
            'restore',
            'resume',
            'status',
            'update',
        ]);
    });

    it('takes the setup link and the directory as arguments, and the key never as one', () =>
    {
        expect(subcommand('install').registeredArguments.map(argument => argument.name()))
            .toEqual(['setup-url', 'directory']);
        expect(optionsOf('install')).toEqual(['--json', '--license-key-stdin']);

        for (const name of ['install', 'restore', 'status', 'check', 'plan', 'update', 'resume', 'abandon'])
        {
            const options = optionsOf(name);

            expect(options, `${name} must not take a license key as an argument`).not.toContain('--license-key');
            expect(options, `${name} must not take a blanket approval`).not.toContain('--yes');
        }
    });

    it('binds approval to an exact plan digest on update, and offers plan-only', () =>
    {
        expect(optionsOf('update')).toEqual(['--approve-plan', '--dir', '--json', '--plan-only', '--to']);
        expect(optionsOf('plan')).toEqual(['--dir', '--json', '--to']);
    });

    it('offers --json everywhere, because every command has an agent reader', () =>
    {
        for (const command of kitCommand.commands)
        {
            expect(optionsOf(command.name()), command.name()).toContain('--json');
        }
    });
});

describe('the command layer, driven end to end against the fake world', () =>
{
    it('refuses to prompt in JSON mode and asks for the key on stdin instead', async () =>
    {
        const world = new FakeKitWorld();

        setKitAdapterFactory(async () => world.adapters);

        await kitCommand.parseAsync(['install', world.setupUrl, target, '--json'], { from: 'user' });

        expect(process.exitCode).toBe(KIT_EXIT.INPUT_REQUIRED);

        const events = jsonEvents();
        const last = events.at(-1) as Record<string, any>;

        expect(last.status).toBe('failed');
        expect(last.code).toBe('KIT_LICENSE_REQUIRED');
        expect(last.evidence.input).toBe('masked-stdin');
    });

    it('reports status as JSON without needing a license at all', async () =>
    {
        const world = new FakeKitWorld();

        setKitAdapterFactory(async () => world.adapters);

        await kitCommand.parseAsync(['status', '--dir', root, '--json'], { from: 'user' });

        const report = JSON.parse(stdout.join(''));

        expect(report.installed).toBe(false);
        expect(report.credential).toBe('unknown');
        expect(process.exitCode).toBeUndefined();
    });

    it('says so plainly when this build has no control-plane client', async () =>
    {
        setKitAdapterFactory(null);

        await kitCommand.parseAsync(['restore', '--dir', root, '--json'], { from: 'user' });

        const [event] = jsonEvents();

        expect(event.code).toBe('CLI_CONTROL_PLANE_CLIENT_ABSENT');
        expect(process.exitCode).toBe(KIT_EXIT.UNAVAILABLE);
    });

    it('still reports the local state when the remote side cannot be reached at all', async () =>
    {
        const world = new FakeKitWorld();
        const { runInstall } = await import('../../src/kit/operations/install.js');

        await runInstall({
            setupUrl: world.setupUrl,
            targetDir: target,
            readLicenseKey: async () => FAKE_LICENSE_KEY,
            json: true,
            write: () => undefined,
        }, world.adapters);

        // No client at all — the most complete case of "remote unavailable".
        setKitAdapterFactory(null);
        stdout.length = 0;

        await kitCommand.parseAsync(['status', '--dir', target, '--json'], { from: 'user' });

        const report = JSON.parse(stdout.join(''));

        expect(report.installed).toBe(true);
        expect(report.release).toBe('1.0.0');
        expect(report.managedDrift).toBe(0);
        expect(report.credential).toBe('unknown');
        expect(report.updateAvailable).toBe('unknown');
        expect(process.exitCode).toBeUndefined();

        stdout.length = 0;
        await kitCommand.parseAsync(['check', '--dir', target, '--json'], { from: 'user' });

        expect(JSON.parse(stdout.join('')).healthy).toBe(true);
    });

    it('prints no secret in any JSON event of a full install', async () =>
    {
        const world = new FakeKitWorld();
        const { runInstall } = await import('../../src/kit/operations/install.js');
        const lines: string[] = [];
        const result = await runInstall({
            setupUrl: world.setupUrl,
            targetDir: target,
            readLicenseKey: async () => FAKE_LICENSE_KEY,
            json: true,
            write: line => lines.push(line),
        }, world.adapters);

        expect(result.status).toBe('completed');

        const output = lines.join('\n');

        expect(output).not.toContain(FAKE_LICENSE_KEY);
        expect(output).not.toMatch(/spfnr_session/);
        expect(output).not.toMatch(/lcc_/);

        // Every line is a single JSON object an agent can parse.
        for (const line of lines)
        {
            expect(() => JSON.parse(line)).not.toThrow();
            expect(JSON.parse(line).schemaVersion).toBe(1);
        }
    });
});
