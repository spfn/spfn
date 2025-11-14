import chalk from 'chalk';
import { listBackupFiles } from './utils/backup-files.js';

/**
 * List all database backups
 */
export async function dbBackupList(): Promise<void>
{
	console.log(chalk.blue('📋 Database backups:\n'));

	const backups = await listBackupFiles();

	if (backups.length === 0)
	{
		console.log(chalk.yellow('No backups found in ./backups directory'));
		console.log(chalk.gray('\n💡 Create a backup with: pnpm spfn db backup\n'));
		return;
	}

	// Display backups in a table-like format
	console.log(chalk.bold('  Date                  Size        File'));
	console.log(chalk.gray('  ─────────────────────────────────────────────────────────'));

	backups.forEach(backup =>
	{
		const date = backup.date.toLocaleString('en-US', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});

		const sizeStr = backup.size.padEnd(10);

		console.log(chalk.white(`  ${date}  ${sizeStr}  ${backup.name}`));
	});

	console.log(chalk.gray(`\n  Total: ${backups.length} backup(s)\n`));
}