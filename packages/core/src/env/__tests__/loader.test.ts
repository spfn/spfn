/**
 * Environment Loader Tests
 *
 * .env 파일 로딩 규칙(서버/환경별/시크릿 분리)의 회귀 검증.
 * 특히 .env.server.local 폐지 이후 server 레이어는 .env.server만 로드해야 한다.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnv } from '../loader';

describe('loadEnv - 파일 로딩 규칙', () =>
{
    const originalEnv = { ...process.env };
    let dir: string;

    beforeEach(() =>
    {
        process.env = { ...originalEnv };
        dir = mkdtempSync(join(tmpdir(), 'spfn-env-'));
    });

    afterEach(() =>
    {
        process.env = originalEnv;
        rmSync(dir, { recursive: true, force: true });
    });

    function write(name: string, body: string): void
    {
        writeFileSync(join(dir, name), body);
    }

    it('server=true면 .env.server를 로드한다', () =>
    {
        write('.env', 'SPFN_ENVTEST_BASE=1');
        write('.env.server', 'SPFN_ENVTEST_SRV=2');

        const result = loadEnv({ cwd: dir, nodeEnv: 'production', server: true });

        expect(result.loadedFiles).toContain('.env.server');
        expect(process.env.SPFN_ENVTEST_SRV).toBe('2');
    });

    it('.env.server.local은 더 이상 로드하지 않는다 (폐지됨)', () =>
    {
        write('.env.server', 'SPFN_ENVTEST_SRV=2');
        write('.env.server.local', 'SPFN_ENVTEST_SECRET=should-not-load');

        const result = loadEnv({ cwd: dir, nodeEnv: 'production', server: true });

        expect(result.loadedFiles).not.toContain('.env.server.local');
        expect(process.env.SPFN_ENVTEST_SECRET).toBeUndefined();
    });

    it('server=false면 .env.server를 로드하지 않는다', () =>
    {
        write('.env', 'SPFN_ENVTEST_BASE=1');
        write('.env.server', 'SPFN_ENVTEST_SRV=2');

        const result = loadEnv({ cwd: dir, nodeEnv: 'production', server: false });

        expect(result.loadedFiles).not.toContain('.env.server');
        expect(process.env.SPFN_ENVTEST_SRV).toBeUndefined();
    });

    it('nodeEnv=test에서는 .env.local을 스킵한다 (테스트 결정론성)', () =>
    {
        write('.env', 'SPFN_ENVTEST_BASE=1');
        write('.env.local', 'SPFN_ENVTEST_LOCAL=local');

        const result = loadEnv({ cwd: dir, nodeEnv: 'test', server: true });

        expect(result.loadedFiles).not.toContain('.env.local');
        expect(process.env.SPFN_ENVTEST_LOCAL).toBeUndefined();
    });

    it('나중 파일이 앞 파일을 덮어쓴다 (.env.server > .env)', () =>
    {
        write('.env', 'SPFN_ENVTEST_KEY=base');
        write('.env.server', 'SPFN_ENVTEST_KEY=server');

        loadEnv({ cwd: dir, nodeEnv: 'production', server: true });

        expect(process.env.SPFN_ENVTEST_KEY).toBe('server');
    });
});

/**
 * Issue #136 — the NODE_ENV warning used to be raised by the logger while it was
 * being imported, which is strictly before any .env file is read. It belongs to
 * loadEnv, and it is a warning about which file set was SELECTED, not about the
 * variable being absent once loading finishes.
 */
describe('loadEnv - NODE_ENV warning', () =>
{
    const originalEnv = { ...process.env };
    let dir: string;
    let warnings: string[];
    let consoleErrorSpy: MockInstance;

    beforeEach(() =>
    {
        process.env = { ...originalEnv };
        dir = mkdtempSync(join(tmpdir(), 'spfn-env-'));
        warnings = [];
        // warn goes to console.error (see transports/console).
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) =>
        {
            warnings.push(args.map(String).join(' '));
        });
    });

    afterEach(() =>
    {
        consoleErrorSpy.mockRestore();
        process.env = originalEnv;
        rmSync(dir, { recursive: true, force: true });
    });

    function write(name: string, body: string): void
    {
        writeFileSync(join(dir, name), body);
    }

    function nodeEnvWarnings(): string[]
    {
        return warnings.filter(line => line.includes('NODE_ENV'));
    }

    it('names the file set it fell back to when NODE_ENV is set nowhere', () =>
    {
        delete process.env.NODE_ENV;
        write('.env', 'SPFN_ENVTEST_BASE=1');

        loadEnv({ cwd: dir });

        expect(nodeEnvWarnings()).toHaveLength(1);
        expect(nodeEnvWarnings()[0]).toContain('"local"');
    });

    it('names the file the wrong guess actually skipped', () =>
    {
        delete process.env.NODE_ENV;
        write('.env.server', 'NODE_ENV=development');
        write('.env.development', 'SPFN_ENVTEST_DEV=missed');

        loadEnv({ cwd: dir });

        expect(process.env.NODE_ENV).toBe('development');
        expect(process.env.SPFN_ENVTEST_DEV).toBeUndefined();
        expect(nodeEnvWarnings()).toHaveLength(1);
        expect(nodeEnvWarnings()[0]).toContain('.env.development was NOT loaded');
    });

    it('stays silent when a wrong guess skipped nothing', () =>
    {
        // The scaffolded app's shape: .env.server declares NODE_ENV, but there
        // is no .env.development file, so nothing was lost.
        delete process.env.NODE_ENV;
        write('.env.server', 'NODE_ENV=development');

        loadEnv({ cwd: dir });

        expect(process.env.NODE_ENV).toBe('development');
        expect(nodeEnvWarnings()).toHaveLength(0);
    });

    it('stays silent when the files declare what was guessed', () =>
    {
        // The example apps' shape: .env.local declares NODE_ENV=local.
        delete process.env.NODE_ENV;
        write('.env.local', 'NODE_ENV=local');

        loadEnv({ cwd: dir });

        expect(nodeEnvWarnings()).toHaveLength(0);
    });

    it('stays silent when the process started with NODE_ENV', () =>
    {
        process.env.NODE_ENV = 'development';
        write('.env', 'SPFN_ENVTEST_BASE=1');

        loadEnv({ cwd: dir });

        expect(nodeEnvWarnings()).toHaveLength(0);
    });

    it('stays silent when the caller named the environment', () =>
    {
        delete process.env.NODE_ENV;
        write('.env', 'SPFN_ENVTEST_BASE=1');

        loadEnv({ cwd: dir, nodeEnv: 'staging' });

        expect(nodeEnvWarnings()).toHaveLength(0);
    });

    it('warns once regardless of how many files were loaded', () =>
    {
        delete process.env.NODE_ENV;
        write('.env', 'SPFN_ENVTEST_BASE=1');
        write('.env.local', 'SPFN_ENVTEST_LOCAL=1');
        write('.env.server', 'SPFN_ENVTEST_SRV=1');

        loadEnv({ cwd: dir });

        expect(nodeEnvWarnings()).toHaveLength(1);
    });
});
