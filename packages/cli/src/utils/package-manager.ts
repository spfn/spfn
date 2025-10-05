import { existsSync } from 'fs';
import { join } from 'path';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export function detectPackageManager(cwd: string): PackageManager
{
    if (existsSync(join(cwd, 'bun.lockb')))
    {
        return 'bun';
    }

    if (existsSync(join(cwd, 'pnpm-lock.yaml')))
    {
        return 'pnpm';
    }

    if (existsSync(join(cwd, 'yarn.lock')))
    {
        return 'yarn';
    }

    return 'npm';
}

export function getInstallCommand(pm: PackageManager): string
{
    switch (pm)
    {
        case 'bun':
            return 'bun install';
        case 'pnpm':
            return 'pnpm install';
        case 'yarn':
            return 'yarn';
        case 'npm':
        default:
            return 'npm install';
    }
}

export function getAddCommand(pm: PackageManager, packages: string[]): string
{
    const pkgs = packages.join(' ');

    switch (pm)
    {
        case 'bun':
            return `bun add ${pkgs}`;
        case 'pnpm':
            return `pnpm add ${pkgs}`;
        case 'yarn':
            return `yarn add ${pkgs}`;
        case 'npm':
        default:
            return `npm install ${pkgs}`;
    }
}