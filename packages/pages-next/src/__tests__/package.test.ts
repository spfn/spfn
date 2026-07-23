import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface PackageManifest
{
    bin?: Record<string, string>;
    files?: string[];
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('package manifest', () =>
{
    it('ships an install-time spfn-pages launcher', async () =>
    {
        const manifest = JSON.parse(
            await readFile(resolve(packageRoot, 'package.json'), 'utf8'),
        ) as PackageManifest;
        const launcher = manifest.bin?.['spfn-pages'];

        expect(launcher).toBe('./bin/spfn-pages.js');
        expect(manifest.files).toContain('bin');
        await expect(access(resolve(packageRoot, launcher!))).resolves.toBeUndefined();
    });
});
