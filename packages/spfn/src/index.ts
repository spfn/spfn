import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { devCommand } from './commands/dev.js';
import { startCommand } from './commands/start.js';
import { generateCommand } from './commands/generate.js';
import { keyCommand } from './commands/key.js';
import { setupCommand } from './commands/setup.js';
import {
    dbGenerate,
    dbPush,
    dbMigrate,
    dbStudio,
    dbDrop,
    dbCheck,
} from './commands/db.js';

const program = new Command();

program
    .name('spfn')
    .description('SPFN CLI - The Missing Backend for Next.js')
    .version('0.1.0');

// Add commands
program.addCommand(initCommand);
program.addCommand(devCommand);
program.addCommand(startCommand);
program.addCommand(generateCommand);
program.addCommand(keyCommand);
program.addCommand(setupCommand);

// Database commands
const dbCommand = new Command('db')
    .description('Database management commands (wraps Drizzle Kit)');

dbCommand
    .command('generate')
    .alias('g')
    .description('Generate database migrations from schema changes')
    .action(dbGenerate);

dbCommand
    .command('push')
    .description('Push schema changes directly to database (no migrations)')
    .action(dbPush);

dbCommand
    .command('migrate')
    .alias('m')
    .description('Run pending migrations')
    .action(dbMigrate);

dbCommand
    .command('studio')
    .description('Open Drizzle Studio (database GUI)')
    .option('-p, --port <port>', 'Studio port', '4983')
    .action((options) => dbStudio(Number(options.port)));

dbCommand
    .command('drop')
    .description('Drop all database tables (⚠️  dangerous!)')
    .action(dbDrop);

dbCommand
    .command('check')
    .description('Check database connection')
    .action(dbCheck);

program.addCommand(dbCommand);

export async function run(): Promise<void>
{
    await program.parseAsync(process.argv);
}