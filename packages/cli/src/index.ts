import { Command } from 'commander';
import { createCommand } from './commands/create.js';
import { initCommand } from './commands/init';
import { devCommand } from './commands/dev.js';
import { buildCommand } from './commands/build.js';
import { startCommand } from './commands/start.js';
import { provisionCommand } from './commands/provision.js';
import { codegenCommand } from './commands/codegen.js';
import { contractCommand } from './commands/contract.js';
import { keyCommand } from './commands/key.js';
import { setupCommand } from './commands/setup.js';
import { dbCommand } from './commands/db';
import { addCommand } from './commands/add.js';
import { envCommand } from './commands/env.js';
import { opsCommand } from './commands/ops/index.js';
import { secretCommand } from './commands/secret/index.js';
import { cloudCommand } from './commands/cloud/index.js';
import { kitCommand } from './commands/kit/index.js';
import { setKitAdapterFactory } from './kit/adapters.js';
import { createLiveKitAdapters } from './kit/live-adapters.js';
import { getCliVersion } from './utils/version.js';

// Export types
export type {
    SpfnConfig,
    PackageManager,
    Region,
    DeploymentConfig,
    CustomDomains,
    EnvironmentVariables,
} from './types/config.js';

const program = new Command();

program
    .name('spfn')
    .description('SPFN CLI - The Missing Backend for Next.js')
    .version(getCliVersion());

// Add commands
program.addCommand(createCommand);
program.addCommand(initCommand);
program.addCommand(addCommand);
program.addCommand(devCommand);
program.addCommand(buildCommand);
program.addCommand(startCommand);
program.addCommand(provisionCommand);
program.addCommand(codegenCommand);
program.addCommand(contractCommand);
program.addCommand(keyCommand);
program.addCommand(setupCommand);
program.addCommand(dbCommand);
program.addCommand(envCommand);
program.addCommand(opsCommand);
program.addCommand(secretCommand);
program.addCommand(cloudCommand);
program.addCommand(kitCommand);

/**
 * The Kit ports, wired.
 *
 * `spfn kit` reaches the outside world through one injected set of ports, and
 * all ten are real implementations now: signed documents, licence activation,
 * credential rotation, the registry proxy, release artifacts and the scaffold
 * on one side; the package manager, the database, the release's gates and Git
 * on the other. Registering the factory here rather than inside the Kit module
 * keeps the seam a seam — a test replaces the whole set with one call, and
 * `setKitAdapterFactory(null)` still means "this run has no client", which is
 * how the read-only commands prove they survive an unreachable remote.
 */
setKitAdapterFactory(async request => createLiveKitAdapters(request));

export { setKitAdapterFactory, type KitAdapterFactory } from './kit/adapters.js';
export { createLiveKitAdapters, type LiveKitAdapterOptions } from './kit/live-adapters.js';
export {
    createKitRemotePorts,
    resolveKitEndpoints,
    kitPackageName,
    CONTROL_PLANE_URL_ENV,
    REGISTRY_URL_ENV,
    DEFAULT_CONTROL_PLANE_URL,
    DEFAULT_REGISTRY_URL,
    type KitEndpoints,
    type KitRemotePorts,
    type KitRemotePortsOptions,
} from './kit/http/index.js';
export {
    createKitLocalPorts,
    PnpmPackageManagerPort,
    SpfnDatabasePort,
    CommandGatePort,
    SystemGitPort,
    type KitLocalPorts,
    type KitLocalPortsOptions,
} from './kit/local/index.js';
export { resolveTrustedKeys, TRUSTED_KEYS_ENV, BUILT_IN_TRUSTED_KEYS } from './kit/trusted-keys.js';
export type { KitAdapters } from './kit/ports.js';

export async function run(): Promise<void>
{
    await program.parseAsync(process.argv);
}
