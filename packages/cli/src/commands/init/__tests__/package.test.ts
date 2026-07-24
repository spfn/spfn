import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupPackageJson } from '../steps/package.js';
import type { PackageJson } from '../steps/validate.js';

const mocks = vi.hoisted(() => ({
    execa: vi.fn().mockResolvedValue(undefined),
    spinner: {
        start: vi.fn().mockReturnThis(),
        succeed: vi.fn(),
        fail: vi.fn(),
    },
}));

vi.mock('execa', () => ({ execa: mocks.execa }));
vi.mock('ora', () => ({ default: () => mocks.spinner }));
vi.mock('../../../utils/version.js', () => ({ getSpfnTag: () => 'beta' }));

let testDirectory: string | undefined;

afterEach(async () =>
{
    vi.clearAllMocks();
    if (testDirectory)
    {
        await rm(testDirectory, { recursive: true, force: true });
        testDirectory = undefined;
    }
});

describe('setupPackageJson', () =>
{
    it('scaffolds the supported Drizzle 1.0 RC dependency set', async () =>
    {
        testDirectory = await mkdtemp(join(tmpdir(), 'spfn-init-package-'));
        const packageJsonPath = join(testDirectory, 'package.json');
        const packageJson: PackageJson = {
            name: 'example-app',
            dependencies: {},
            devDependencies: {},
            scripts: {},
        };

        await setupPackageJson(
            testDirectory,
            packageJsonPath,
            packageJson,
            'pnpm',
            false,
        );

        const generated = JSON.parse(
            await readFile(packageJsonPath, 'utf8'),
        ) as PackageJson;
        expect(generated.dependencies?.['drizzle-orm']).toBe('1.0.0-rc.4');
        expect(generated.dependencies?.['drizzle-typebox']).toBe('^0.3.3');
        expect(generated.devDependencies?.['drizzle-kit']).toBe('1.0.0-rc.4');
        expect(mocks.execa).toHaveBeenCalledWith('pnpm', ['install'], {
            cwd: testDirectory,
        });
    });
});
