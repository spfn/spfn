/**
 * The four ports that are local process work, assembled.
 *
 * Everything a Kit operation does on this machine rather than over the network
 * ends up here: installing the graph, applying migrations, running the
 * release's gates and making the first commit. They are built together because
 * two of them depend on a third — the `db-status` gate has to be the same
 * database port the migration step used, or a gate could contradict the step
 * it follows.
 */

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DatabasePort, GatePort, GitPort, PackageManagerPort, ProjectModuleLoader } from '../ports.js';
import { PnpmPackageManagerPort, type PnpmPackageManagerOptions } from './package-manager.js';
import { SpfnDatabasePort, type SpfnDatabaseOptions } from './database.js';
import { CommandGatePort } from './gates.js';
import { SystemGitPort, type SystemGitOptions } from './git.js';

export interface KitLocalPortsOptions
{
    packageManager?: PnpmPackageManagerOptions;
    database?: SpfnDatabaseOptions;
    git?: SystemGitOptions;
    gateTimeoutMs?: number;
}

export interface KitLocalPorts
{
    packageManager: PackageManagerPort;
    database: DatabasePort;
    gates: GatePort;
    git: GitPort;
    loadProjectModule: ProjectModuleLoader;
}

export function createKitLocalPorts(options: KitLocalPortsOptions = {}): KitLocalPorts
{
    const database = new SpfnDatabasePort(options.database);

    return {
        packageManager: new PnpmPackageManagerPort(options.packageManager),
        database,
        gates: new CommandGatePort({
            database,
            packageManagerBinary: options.packageManager?.binary,
            timeoutMs: options.gateTimeoutMs,
            run: options.packageManager?.run,
        }),
        git: new SystemGitPort(options.git),
        loadProjectModule: createProjectModuleLoader(),
    };
}

/**
 * Load a module the way the *project* would, not the way this CLI would.
 *
 * A Kit's tooling is a package the release installed into the customer's
 * project, and resolving it from the CLI's own directory would find either
 * nothing or — worse — a different copy that happens to sit near the CLI.
 */
export function createProjectModuleLoader(): ProjectModuleLoader
{
    return async (specifier: string, projectDir: string): Promise<unknown> =>
    {
        const resolve = createRequire(join(projectDir, 'package.json'));

        return import(pathToFileURL(resolve.resolve(specifier)).href);
    };
}

export { PnpmPackageManagerPort, SpfnDatabasePort, CommandGatePort, SystemGitPort };
