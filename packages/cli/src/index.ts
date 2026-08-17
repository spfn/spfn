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

export async function run(): Promise<void>
{
    await program.parseAsync(process.argv);
}
