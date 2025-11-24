/**
 * Database Management Commands
 *
 * Wraps Drizzle Kit commands with auto-generated config
 */

import { Command } from 'commander';
import { dbGenerate } from './generate.js';
import { dbPush } from './push.js';
import { dbMigrate } from './migrate.js';
import { dbStudio } from './studio.js';
import { dbDrop } from './drop.js';
import { dbCheck } from './check.js';
import { dbBackup } from './backup.js';
import { dbRestore } from './restore.js';
import { dbBackupList } from './list.js';
import { dbBackupClean } from './clean.js';

/**
 * Database command group
 */
export const dbCommand = new Command('db')
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
    .option('--with-backup', 'Create backup before running migrations')
    .action((options) => dbMigrate(options));

dbCommand
    .command('studio')
    .description('Open Drizzle Studio (database GUI)')
    .option('-p, --port <port>', 'Studio port (auto-finds if in use)')
    .action((options) => dbStudio(options.port ? Number(options.port) : undefined));

dbCommand
    .command('drop')
    .description('Drop all database tables (⚠️  dangerous!)')
    .action(dbDrop);

dbCommand
    .command('check')
    .description('Check database connection')
    .action(dbCheck);

dbCommand
	.command('backup')
	.description('Create a database backup')
	.option('-f, --format <format>', 'Backup format (sql or custom)', 'sql')
	.option('-o, --output <path>', 'Custom output path')
	.option('-s, --schema <name>', 'Backup specific schema only')
	.option('--data-only', 'Backup data only (no schema)')
	.option('--schema-only', 'Backup schema only (no data)')
	.option('--tag <tags>', 'Comma-separated tags for this backup')
	.option('--env <environment>', 'Environment label (e.g., production, staging)')
	.action((options) => dbBackup(options));

dbCommand
	.command('restore [file]')
	.description('Restore database from backup')
	.option('--drop', 'Drop existing tables before restore')
	.option('-s, --schema <name>', 'Restore specific schema only')
	.option('--data-only', 'Restore data only (requires custom format .dump file)')
	.option('--schema-only', 'Restore schema only (requires custom format .dump file)')
	.action((file, options) => dbRestore(file, options));

dbCommand
	.command('backup:list')
	.description('List all database backups')
	.action(dbBackupList);

dbCommand
	.command('backup:clean')
	.description('Clean old database backups')
	.option('-k, --keep <number>', 'Keep N most recent backups', parseInt)
	.option('-o, --older-than <days>', 'Delete backups older than N days', parseInt)
	.action((options) => dbBackupClean(options));