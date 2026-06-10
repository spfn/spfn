/**
 * Environment Loader Tests
 *
 * .env 파일 로딩 규칙(서버/환경별/시크릿 분리)의 회귀 검증.
 * 특히 .env.server.local 폐지 이후 server 레이어는 .env.server만 로드해야 한다.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
