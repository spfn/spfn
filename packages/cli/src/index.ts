import { Command } from 'commander';
import { createCommand } from './commands/create.js';
import { initCommand } from './commands/init';
import { devCommand } from './commands/dev.js';
import { buildCommand } from './commands/build.js';
import { startCommand } from './commands/start.js';
import { codegenCommand } from './commands/codegen.js';
import { keyCommand } from './commands/key.js';
import { setupCommand } from './commands/setup.js';
import { dbCommand } from './commands/db';
import { addCommand } from './commands/add.js';
import { generateCommand } from './commands/generate.js';
import { envCommand } from './commands/env.js';
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
program.addCommand(generateCommand);
program.addCommand(devCommand);
program.addCommand(buildCommand);
program.addCommand(startCommand);
program.addCommand(codegenCommand);
program.addCommand(keyCommand);
program.addCommand(setupCommand);
program.addCommand(dbCommand);
program.addCommand(envCommand);

export async function run(): Promise<void>
{
    await program.parseAsync(process.argv);
}