import { Command } from 'commander';
import { createCommand } from './commands/create.js';
import { initCommand } from './commands/init.js';
import { devCommand } from './commands/dev.js';
import { buildCommand } from './commands/build.js';
import { startCommand } from './commands/start.js';
import { codegenCommand } from './commands/codegen.js';
import { keyCommand } from './commands/key.js';
import { setupCommand } from './commands/setup.js';
import { dbCommand } from './commands/db.js';

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
    .version('0.1.0');

// Add commands
program.addCommand(createCommand);
program.addCommand(initCommand);
program.addCommand(devCommand);
program.addCommand(buildCommand);
program.addCommand(startCommand);
program.addCommand(codegenCommand);
program.addCommand(keyCommand);
program.addCommand(setupCommand);
program.addCommand(dbCommand);

export async function run(): Promise<void>
{
    await program.parseAsync(process.argv);
}