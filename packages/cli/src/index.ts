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
 * The Kit ports that are already real, and the seam they plug into.
 *
 * `spfn kit` reaches the outside world through one injected set of ports. Six
 * of them — signed documents, the licence control plane, credential rotation,
 * the registry proxy, release artifacts and the scaffold, plus the exact-graph
 * proof that runs in front of the package manager — are built here and shipped.
 * The four that remain are local process work: installing, migrating, running
 * the release's gates and Git. An integration run supplies those and registers
 * the whole set with `setKitAdapterFactory`.
 *
 * Exported rather than wired in place, because a half-wired factory would make
 * `spfn kit install` claim a client it cannot finish the job with. Until all
 * ten ports are real the command reports `CLI_CONTROL_PLANE_CLIENT_ABSENT`,
 * which is the true statement about this build.
 */
export { setKitAdapterFactory, type KitAdapterFactory } from './kit/adapters.js';
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
export type { KitAdapters } from './kit/ports.js';

export async function run(): Promise<void>
{
    await program.parseAsync(process.argv);
}
