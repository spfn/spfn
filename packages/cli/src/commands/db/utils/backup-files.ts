import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import chalk from 'chalk';
import { formatBytes } from './formatters.js';
import { loadBackupMetadata, type BackupMetadata } from './metadata.js';

/**
 * Ensure backups/ is added to project .gitignore
 */
async function ensureBackupInGitignore(): Promise<void>
{
	const gitignorePath = path.join(process.cwd(), '.gitignore');

	try
	{
		let content = '';
		let exists = existsSync(gitignorePath);

		if (exists)
		{
			content = await fs.readFile(gitignorePath, 'utf-8');
		}

		// Check if backups/ is already ignored
		const lines = content.split('\n');
		const hasBackupsIgnore = lines.some(line =>
			line.trim() === 'backups/' ||
			line.trim() === '/backups/' ||
			line.trim() === 'backups'
		);

		if (!hasBackupsIgnore)
		{
			const entry = exists && content && !content.endsWith('\n')
				? '\n\n# Database backups\nbackups/\n'
				: '# Database backups\nbackups/\n';

			await fs.appendFile(gitignorePath, entry);
			console.log(chalk.dim('✓ Added backups/ to .gitignore'));
		}
	}
	catch (error)
	{
		// Non-critical error, just log it
		console.log(chalk.dim('⚠️  Could not update .gitignore'));
	}
}

/**
 * Ensure backups directory exists with .gitignore
 */
export async function ensureBackupDir(): Promise<string>
{
	const backupDir = path.join(process.cwd(), 'backups');

	try
	{
		await fs.mkdir(backupDir, { recursive: true });

		// Create .gitignore if it doesn't exist
		const gitignorePath = path.join(backupDir, '.gitignore');
		const gitignoreExists = existsSync(gitignorePath);

		if (!gitignoreExists)
		{
			await fs.writeFile(gitignorePath, '# Ignore all backup files\n*.sql\n*.dump\n*.meta.json\n');
		}

		// Ensure project root .gitignore includes backups/
		await ensureBackupInGitignore();

		return backupDir;
	}
	catch (error)
	{
		throw new Error(`Failed to create backup directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

/**
 * Backup file info
 */
export interface BackupFile
{
	name: string;
	path: string;
	size: string;
	sizeBytes: number;
	date: Date;
	metadata?: BackupMetadata;
}

/**
 * List all backup files
 */
export async function listBackupFiles(): Promise<BackupFile[]>
{
	const backupDir = path.join(process.cwd(), 'backups');

	try
	{
		const files = await fs.readdir(backupDir);

		const backups = await Promise.all(
			files
				.filter(f => f.endsWith('.sql') || f.endsWith('.dump'))
				.map(async (f) =>
				{
					const filepath = path.join(backupDir, f);
					const stats = await fs.stat(filepath);

					// Load metadata if available
					const metadata = await loadBackupMetadata(filepath);

					return {
						name: f,
						path: filepath,
						size: formatBytes(stats.size),
						sizeBytes: stats.size,
						date: stats.mtime,
						metadata
					};
				})
		);

		// Sort by date (newest first)
		return backups.sort((a, b) => b.date.getTime() - a.date.getTime());
	}
	catch (error)
	{
		if ((error as NodeJS.ErrnoException).code === 'ENOENT')
		{
			return [];
		}

		throw error;
	}
}