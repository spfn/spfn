import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { formatBytes, formatPercent, isNearLimit } from '../cloud/format.js';
import { readCloudConfig, writeCloudConfig, requireLinked } from '../cloud/config.js';

describe('isNearLimit', () =>
{
    it('flags 80% and above — where the migration prompt appears', () =>
    {
        expect(isNearLimit(79, 100)).toBe(false);
        expect(isNearLimit(80, 100)).toBe(true);
        expect(isNearLimit(120, 100)).toBe(true);
    });

    it('never flags a zero/unknown limit', () =>
    {
        expect(isNearLimit(100, 0)).toBe(false);
    });
});

describe('formatPercent', () =>
{
    it('renders a ratio and handles a zero limit as n/a', () =>
    {
        expect(formatPercent(50, 100)).toContain('50.0%');
        expect(formatPercent(1, 0)).toContain('n/a');
    });
});

describe('formatBytes', () =>
{
    it('picks a unit by magnitude', () =>
    {
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(52428800)).toBe('50.0 MB');
        expect(formatBytes(2 * 1024 ** 3)).toBe('2.00 GB');
    });
});

describe('cloud config round-trip', () =>
{
    it('writes, gitignores, and reads identifiers back', () =>
    {
        const dir = mkdtempSync(join(tmpdir(), 'spfn-cloud-config-'));

        try
        {
            expect(readCloudConfig(dir)).toEqual({});

            writeCloudConfig(dir, { vercel: { projectId: 'prj_123', projectName: 'demo' } });

            expect(readCloudConfig(dir).vercel?.projectId).toBe('prj_123');
            expect(readFileSync(join(dir, '.gitignore'), 'utf-8')).toContain('.spfn/cloud.json');
        }
        finally
        {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('requireLinked names the missing provider and the fix', () =>
    {
        expect(() => requireLinked({}, 'supabase')).toThrow(/supabase.*spfn cloud link/);
    });
});
