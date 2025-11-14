import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import chalk from 'chalk';

const execAsync = promisify(exec);

/**
 * Backup metadata structure
 */
export interface BackupMetadata
{
	// Basic info
	timestamp: string;
	database: string;
	environment?: string;

	// Git info
	git?: {
		commit: string;
		branch: string;
		tag?: string;
		dirty: boolean;
	};

	// Migration info
	migrations?: {
		lastApplied: string;
		count: number;
		hash: string;
	};

	// Backup file info
	backup: {
		filename: string;
		format: 'sql' | 'custom';
		sizeBytes: number;
		schema?: string;
		dataOnly?: boolean;
		schemaOnly?: boolean;
	};

	// User-defined
	tags?: string[];
	notes?: string;
}

/**
 * Collect Git information for backup metadata
 */
export async function collectGitInfo(): Promise<BackupMetadata['git'] | undefined>
{
	try
	{
		// Check if we're in a git repository
		const { stdout: isRepo } = await execAsync('git rev-parse --is-inside-work-tree 2>/dev/null || echo "false"');
		if (isRepo.trim() !== 'true')
		{
			return undefined;
		}

		// Get commit hash
		const { stdout: commit } = await execAsync('git rev-parse HEAD');

		// Get branch name
		const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD');

		// Try to get tag (may fail if not on a tagged commit)
		let tag: string | undefined;
		try
		{
			const { stdout: tagOutput } = await execAsync('git describe --tags --exact-match 2>/dev/null');
			tag = tagOutput.trim() || undefined;
		}
		catch
		{
			// Not on a tagged commit, that's okay
		}

		// Check if there are uncommitted changes
		const { stdout: status } = await execAsync('git status --porcelain');
		const dirty = status.trim().length > 0;

		return {
			commit: commit.trim(),
			branch: branch.trim(),
			tag,
			dirty
		};
	}
	catch (error)
	{
		// Git not available or not in a git repo
		return undefined;
	}
}

/**
 * Collect migration information from database
 */
export async function collectMigrationInfo(dbUrl: string): Promise<BackupMetadata['migrations'] | undefined>
{
	try
	{
		const { Pool } = await import('pg');
		const pool = new Pool({ connectionString: dbUrl });

		try
		{
			// Check if migrations table exists
			const tableCheck = await pool.query(`
				SELECT EXISTS (
					SELECT FROM information_schema.tables
					WHERE table_name = '__drizzle_migrations'
				);
			`);

			if (!tableCheck.rows[0].exists)
			{
				return undefined;
			}

			// Get migration info
			const result = await pool.query(`
				SELECT * FROM __drizzle_migrations
				ORDER BY created_at DESC
				LIMIT 1;
			`);

			if (result.rows.length === 0)
			{
				return undefined;
			}

			const lastMigration = result.rows[0];

			// Get total count
			const countResult = await pool.query(`
				SELECT COUNT(*) as count FROM __drizzle_migrations;
			`);

			return {
				lastApplied: lastMigration.hash || 'unknown',
				count: parseInt(countResult.rows[0].count),
				hash: lastMigration.hash
			};
		}
		finally
		{
			await pool.end();
		}
	}
	catch (error)
	{
		// Database connection failed or table doesn't exist
		console.log(chalk.dim('⚠️  Could not fetch migration info'));
		return undefined;
	}
}

/**
 * Save backup metadata to JSON file
 */
export async function saveBackupMetadata(metadata: BackupMetadata, backupFilename: string): Promise<void>
{
	const metadataPath = backupFilename.replace(/\.(sql|dump)$/, '.meta.json');

	try
	{
		await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
		console.log(chalk.dim(`✓ Metadata saved: ${path.basename(metadataPath)}`));
	}
	catch (error)
	{
		console.log(chalk.dim('⚠️  Could not save metadata'));
	}
}

/**
 * Load backup metadata from JSON file
 */
export async function loadBackupMetadata(backupFilename: string): Promise<BackupMetadata | undefined>
{
	const metadataPath = backupFilename.replace(/\.(sql|dump)$/, '.meta.json');

	try
	{
		const content = await fs.readFile(metadataPath, 'utf-8');
		return JSON.parse(content);
	}
	catch (error)
	{
		return undefined;
	}
}