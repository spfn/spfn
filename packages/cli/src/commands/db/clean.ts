import { promises as fs } from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';
import { listBackupFiles, type BackupFile } from './utils/backup-files.js';

/**
 * Clean old backups
 */
export async function dbBackupClean(options: {
	keep?: number;
	olderThan?: number;
}): Promise<void>
{
	console.log(chalk.blue('🧹 Cleaning old backups...\n'));

	const backups = await listBackupFiles();

	if (backups.length === 0)
	{
		console.log(chalk.yellow('No backups found'));
		return;
	}

	let toDelete: BackupFile[] = [];

	// Filter by --keep option
	if (options.keep !== undefined)
	{
		const keepCount = options.keep;
		toDelete = backups.slice(keepCount); // Keep first N, delete rest
	}
	// Filter by --older-than option
	else if (options.olderThan !== undefined)
	{
		const daysAgo = options.olderThan;
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

		toDelete = backups.filter(b => b.date < cutoffDate);
	}
	else
	{
		// Default: keep 10 most recent
		const defaultKeep = 10;
		toDelete = backups.slice(defaultKeep);
	}

	if (toDelete.length === 0)
	{
		console.log(chalk.green('✅ No backups to clean'));
		return;
	}

	// Show what will be deleted
	console.log(chalk.yellow(`The following ${toDelete.length} backup(s) will be deleted:\n`));

	toDelete.forEach(backup =>
	{
		console.log(chalk.gray(`  - ${backup.name} (${backup.size})`));
	});

	// Confirm deletion
	const { confirm } = await prompts({
		type: 'confirm',
		name: 'confirm',
		message: '\nProceed with deletion?',
		initial: false,
	});

	if (!confirm)
	{
		console.log(chalk.gray('Cancelled'));
		return;
	}

	// Delete files
	const spinner = ora('Deleting backups...').start();

	try
	{
		await Promise.all(toDelete.flatMap(backup => [
			fs.unlink(backup.path),
			// Remove the .meta.json sidecar too (force: ok if it doesn't exist)
			fs.rm(backup.path.replace(/\.(sql|dump)$/, '.meta.json'), { force: true }),
		]));

		spinner.succeed('Backups deleted');
		console.log(chalk.green(`\n✅ Deleted ${toDelete.length} backup(s)`));
	}
	catch (error)
	{
		spinner.fail('Failed to delete backups');
		console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
		process.exit(1);
	}
}