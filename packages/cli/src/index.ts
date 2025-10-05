import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { devCommand } from './commands/dev.js';
import { startCommand } from './commands/start.js';

const program = new Command();

program
    .name('spfn')
    .description('SPFN CLI - The Missing Backend for Next.js')
    .version('0.1.0');

// Add commands
program.addCommand(initCommand);
program.addCommand(devCommand);
program.addCommand(startCommand);

export async function run(): Promise<void>
{
    await program.parseAsync(process.argv);
}