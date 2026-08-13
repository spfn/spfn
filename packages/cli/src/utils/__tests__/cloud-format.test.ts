import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { formatBytes, formatPercent, isNearLimit, sameUnit } from '../cloud/format.js';
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
    it('uses decimal units — the base both providers state their limits in', () =>
    {
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(50_000_000)).toBe('50.0 MB');
        // Supabase's 500 MB ceiling must read as exactly 500, not 476.84
        expect(formatBytes(500_000_000)).toBe('500.0 MB');
        expect(formatBytes(2_000_000_000)).toBe('2.00 GB');
    });
});

describe('sameUnit', () =>
{
    it('treats an empty reported unit as agreement and compares case-insensitively', () =>
    {
        expect(sameUnit('', 'GB')).toBe(true);
        expect(sameUnit('gb', 'GB')).toBe(true);
        expect(sameUnit('MB', 'GB')).toBe(false);
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

    it('a corrupt config file fails with a message naming the file and the fix, not a JSON stack', () =>
    {
        const dir = mkdtempSync(join(tmpdir(), 'spfn-cloud-corrupt-'));

        try
        {
            mkdirSync(join(dir, '.spfn'));
            writeFileSync(join(dir, '.spfn', 'cloud.json'), '{ truncated', 'utf-8');

            expect(() => readCloudConfig(dir)).toThrow(/cloud\.json is not valid JSON.*spfn cloud link/);
        }
        finally
        {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
