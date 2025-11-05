/**
 * Database Management Commands
 *
 * Wraps Drizzle Kit commands with auto-generated config
 */

import { Command } from 'commander';
import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';
import net from 'net';

const execAsync = promisify(exec);

/**
 * Check if a port is available
 */
async function isPortAvailable(port: number): Promise<boolean>
{
	return new Promise((resolve) =>
	{
		const server = net.createServer();

		server.once('error', () =>
		{
			server.close();
			resolve(false);
		});

		server.once('listening', () =>
		{
			server.close();
			resolve(true);
		});

		server.listen(port, '127.0.0.1');
	});
}

/**
 * Find an available port starting from the given port
 */
async function findAvailablePort(startPort: number, maxAttempts: number = 10): Promise<number>
{
	for (let i = 0; i < maxAttempts; i++)
	{
		const port = startPort + i;
		if (await isPortAvailable(port))
		{
			return port;
		}
	}

	throw new Error(`No available ports found between ${startPort} and ${startPort + maxAttempts - 1}`);
}

/**
 * Parse DATABASE_URL into connection info
 */
interface DbConnectionInfo
{
	host: string;
	port: string;
	user: string;
	password: string;
	database: string;
}

function parseDatabaseUrl(dbUrl: string): DbConnectionInfo
{
	try
	{
		const url = new URL(dbUrl);
		return {
			host: url.hostname,
			port: url.port || '5432',
			user: url.username,
			password: url.password,
			database: url.pathname.slice(1), // Remove leading /
		};
	}
	catch (error)
	{
		throw new Error(`Invalid DATABASE_URL format: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string
{
	if (bytes === 0)
	{
		return '0 B';
	}

	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Format timestamp for backup filename
 */
function formatTimestamp(): string
{
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	const hours = String(now.getHours()).padStart(2, '0');
	const minutes = String(now.getMinutes()).padStart(2, '0');
	const seconds = String(now.getSeconds()).padStart(2, '0');

	return `${year}-${month}-${day}_${hours}${minutes}${seconds}`;
}

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
async function ensureBackupDir(): Promise<string>
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
 * Backup metadata structure
 */
interface BackupMetadata
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
async function collectGitInfo(): Promise<BackupMetadata['git'] | undefined>
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
async function collectMigrationInfo(dbUrl: string): Promise<BackupMetadata['migrations'] | undefined>
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
async function saveBackupMetadata(metadata: BackupMetadata, backupFilename: string): Promise<void>
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
async function loadBackupMetadata(backupFilename: string): Promise<BackupMetadata | undefined>
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

/**
 * List all backup files
 */
interface BackupFile
{
	name: string;
	path: string;
	size: string;
	sizeBytes: number;
	date: Date;
	metadata?: BackupMetadata;
}

async function listBackupFiles(): Promise<BackupFile[]>
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

/**
 * Generate temporary drizzle.config.ts and run drizzle-kit command
 */
async function runDrizzleCommand(command: string): Promise<void>
{
    // Load environment variables first
    const { loadEnvironment } = await import('@spfn/core/env');
    loadEnvironment({ debug: false });

    const hasUserConfig = existsSync('./drizzle.config.ts');
    const tempConfigPath = `./drizzle.config.${process.pid}.${Date.now()}.temp.ts`;

    try
    {
        const configPath = hasUserConfig ? './drizzle.config.ts' : tempConfigPath;

        if (!hasUserConfig)
        {
            if (!process.env.DATABASE_URL)
            {
                console.error(chalk.red('❌ DATABASE_URL not found in environment'));
                console.log(chalk.yellow('\n💡 Tip: Add DATABASE_URL to your .env file'));
                process.exit(1);
            }

            // Generate temporary config
            const { generateDrizzleConfigFile } = await import('@spfn/core/db');
            const configContent = generateDrizzleConfigFile({
                cwd: process.cwd(),
                // Exclude package schemas to avoid .ts/.js mixing (packages use migrations instead)
                disablePackageDiscovery: true
            });

            writeFileSync(tempConfigPath, configContent);
            console.log(chalk.dim('Using auto-generated Drizzle config\n'));
        }

        // Run drizzle-kit command
        const fullCommand = `drizzle-kit ${command} --config=${configPath}`;
        const { stdout, stderr } = await execAsync(fullCommand);

        if (stdout)
        {
            console.log(stdout);
        }

        if (stderr)
        {
            console.error(stderr);
        }
    }
    finally
    {
        // Clean up temp config
        if (!hasUserConfig && existsSync(tempConfigPath))
        {
            unlinkSync(tempConfigPath);
        }
    }
}

/**
 * Helper: Run drizzle command with spinner
 */
async function runWithSpinner(
    spinnerText: string,
    command: string,
    successMessage: string,
    failMessage: string
): Promise<void>
{
    const spinner = ora(spinnerText).start();

    try
    {
        spinner.stop();
        await runDrizzleCommand(command);
        console.log(chalk.green(`✅ ${successMessage}`));
    }
    catch (error)
    {
        spinner.fail(failMessage);
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
    }
}

/**
 * Generate database migrations from schema changes
 */
async function dbGenerate(): Promise<void>
{
    await runWithSpinner(
        'Generating database migrations...',
        'generate',
        'Migrations generated successfully',
        'Failed to generate migrations'
    );
}

/**
 * Push schema changes directly to database (no migrations)
 * Also applies function package migrations if available
 */
async function dbPush(): Promise<void>
{
    // Load environment variables first (required for DATABASE_URL)
    const { loadEnvironment } = await import('@spfn/core/env');
    loadEnvironment({ debug: false });

    // First, push schema changes
    await runWithSpinner(
        'Pushing schema changes to database...',
        'push',
        'Schema pushed successfully',
        'Failed to push schema'
    );

    // Then, execute function package migrations
    const { discoverFunctionMigrations, executeFunctionMigrations } = await import('../utils/function-migrations.js');

    const functions = discoverFunctionMigrations(process.cwd());

    if (functions.length > 0)
    {
        console.log(chalk.blue('\n📦 Applying function package migrations:'));
        functions.forEach(func =>
        {
            console.log(chalk.dim(`  - ${func.packageName}`));
        });

        try
        {
            await executeFunctionMigrations(functions);
            console.log(chalk.green('\n✅ All function migrations applied\n'));
        }
        catch (error)
        {
            console.error(chalk.red('\n❌ Failed to apply function migrations'));
            console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
            process.exit(1);
        }
    }
}

/**
 * Run pending migrations
 *
 * This command applies migrations created by `spfn db generate`.
 * Also applies function package migrations if available.
 * Use this in both development and production environments.
 */
async function dbMigrate(options: { withBackup?: boolean } = {}): Promise<void>
{
    // Load environment variables first (required for DATABASE_URL)
    const { loadEnvironment } = await import('@spfn/core/env');
    loadEnvironment({ debug: false });

    // Create backup before migration if requested
    if (options.withBackup)
    {
        console.log(chalk.blue('📦 Creating pre-migration backup...\n'));
        await dbBackup({
            format: 'custom',
            tag: 'pre-migration',
            env: process.env.NODE_ENV
        });
        console.log('');
    }

    // First, execute function package migrations
    const { discoverFunctionMigrations, executeFunctionMigrations } = await import('../utils/function-migrations.js');

    const functions = discoverFunctionMigrations(process.cwd());

    if (functions.length > 0)
    {
        console.log(chalk.blue('📦 Applying function package migrations:'));
        functions.forEach(func =>
        {
            console.log(chalk.dim(`  - ${func.packageName}`));
        });

        try
        {
            await executeFunctionMigrations(functions);
            console.log(chalk.green('✅ Function migrations applied\n'));
        }
        catch (error)
        {
            console.error(chalk.red('\n❌ Failed to apply function migrations'));
            console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
            process.exit(1);
        }
    }

    // Then, run project migrations
    await runWithSpinner(
        'Running project migrations...',
        'migrate',
        'Project migrations applied successfully',
        'Failed to run project migrations'
    );
}

/**
 * Open Drizzle Studio (database GUI)
 * Uses spawn instead of exec to handle long-running process
 */
async function dbStudio(requestedPort?: number): Promise<void>
{
    console.log(chalk.blue('🎨 Opening Drizzle Studio...\n'));

    // Load environment variables first
    const { loadEnvironment } = await import('@spfn/core/env');
    loadEnvironment({ debug: false });

    // Find available port
    const defaultPort = 4983;
    const startPort = requestedPort || defaultPort;
    let port: number;

    try
    {
        port = await findAvailablePort(startPort);

        if (port !== startPort)
        {
            console.log(chalk.yellow(`⚠️  Port ${startPort} is in use, using port ${port} instead\n`));
        }
    }
    catch (error)
    {
        console.error(chalk.red(error instanceof Error ? error.message : 'Failed to find available port'));
        process.exit(1);
    }

    const hasUserConfig = existsSync('./drizzle.config.ts');
    const tempConfigPath = `./drizzle.config.${process.pid}.${Date.now()}.temp.ts`;

    try
    {
        const configPath = hasUserConfig ? './drizzle.config.ts' : tempConfigPath;

        if (!hasUserConfig)
        {
            if (!process.env.DATABASE_URL)
            {
                console.error(chalk.red('❌ DATABASE_URL not found in environment'));
                console.log(chalk.yellow('\n💡 Tip: Add DATABASE_URL to your .env file'));
                process.exit(1);
            }

            // Generate temporary config
            const { generateDrizzleConfigFile } = await import('@spfn/core/db');
            const configContent = generateDrizzleConfigFile({
                cwd: process.cwd(),
                disablePackageDiscovery: true
            });

            writeFileSync(tempConfigPath, configContent);
            console.log(chalk.dim('Using auto-generated Drizzle config\n'));
        }

        // Spawn drizzle-kit studio process
        const studioProcess = spawn('drizzle-kit', ['studio', `--port=${port}`, `--config=${configPath}`], {
            stdio: 'inherit',
            shell: true
        });

        // Handle process termination
        const cleanup = () =>
        {
            if (!hasUserConfig && existsSync(tempConfigPath))
            {
                unlinkSync(tempConfigPath);
            }
        };

        studioProcess.on('exit', (code) =>
        {
            cleanup();
            if (code !== 0 && code !== null)
            {
                console.error(chalk.red(`\n❌ Drizzle Studio exited with code ${code}`));
                process.exit(code);
            }
        });

        studioProcess.on('error', (error) =>
        {
            cleanup();
            console.error(chalk.red('❌ Failed to start Drizzle Studio'));
            console.error(chalk.red(error.message));
            process.exit(1);
        });

        // Handle Ctrl+C gracefully
        process.on('SIGINT', () =>
        {
            console.log(chalk.yellow('\n\n👋 Shutting down Drizzle Studio...'));
            studioProcess.kill('SIGTERM');
            cleanup();
            process.exit(0);
        });

        process.on('SIGTERM', () =>
        {
            studioProcess.kill('SIGTERM');
            cleanup();
            process.exit(0);
        });
    }
    catch (error)
    {
        // Clean up temp config on error
        if (!hasUserConfig && existsSync(tempConfigPath))
        {
            unlinkSync(tempConfigPath);
        }

        console.error(chalk.red('❌ Failed to start Drizzle Studio'));
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
    }
}

/**
 * Drop all database tables (dangerous!)
 */
async function dbDrop(): Promise<void>
{
    console.log(chalk.yellow('⚠️  WARNING: This will drop all tables in your database!'));

    // Confirmation prompt
    const { confirm } = await prompts({
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to drop all tables?',
        initial: false,
    });

    if (!confirm)
    {
        console.log(chalk.gray('Cancelled.'));
        process.exit(0);
    }

    await runWithSpinner(
        'Dropping all tables...',
        'drop',
        'All tables dropped',
        'Failed to drop tables'
    );
}

/**
 * Check database connection
 */
async function dbCheck(): Promise<void>
{
    const spinner = ora('Checking database connection...').start();

    try
    {
        await runDrizzleCommand('check');
        spinner.succeed('Database connection OK');
    }
    catch (error)
    {
        spinner.fail('Database connection failed');
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
    }
}

/**
 * Backup database to file
 */
async function dbBackup(options: {
	format?: 'sql' | 'custom';
	output?: string;
	schema?: string;
	dataOnly?: boolean;
	schemaOnly?: boolean;
	tag?: string;
	env?: string;
}): Promise<void>
{
	console.log(chalk.blue('💾 Creating database backup...\n'));

	// Load environment variables
	const { loadEnvironment } = await import('@spfn/core/env');
	loadEnvironment({ debug: false });

	const dbUrl = process.env.DATABASE_URL;

	if (!dbUrl)
	{
		console.error(chalk.red('❌ DATABASE_URL not found in environment'));
		console.log(chalk.yellow('\n💡 Tip: Add DATABASE_URL to your .env file'));
		process.exit(1);
	}

	// Parse connection info
	const dbInfo = parseDatabaseUrl(dbUrl);

	// Ensure backup directory exists
	const backupDir = await ensureBackupDir();

	// Generate filename
	const timestamp = formatTimestamp();
	const format = options.format || 'sql';
	const ext = format === 'sql' ? 'sql' : 'dump';
	const filename = options.output || path.join(backupDir, `${dbInfo.database}_${timestamp}.${ext}`);

	// Validate mutually exclusive options
	if (options.dataOnly && options.schemaOnly)
	{
		console.error(chalk.red('❌ Cannot use --data-only and --schema-only together'));
		process.exit(1);
	}

	// Build pg_dump command args
	const args = [
		'-h', dbInfo.host,
		'-p', dbInfo.port,
		'-U', dbInfo.user,
		'-d', dbInfo.database,
		'-f', filename,
	];

	if (format === 'custom')
	{
		args.push('-Fc'); // Custom format with compression
	}

	if (options.schema)
	{
		args.push('-n', options.schema);
	}

	if (options.dataOnly)
	{
		args.push('--data-only');
	}

	if (options.schemaOnly)
	{
		args.push('--schema-only');
	}

	// Execute pg_dump
	const spinner = ora('Creating backup...').start();

	const pgDump = spawn('pg_dump', args, {
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			PGPASSWORD: dbInfo.password,
		},
	});

	let errorOutput = '';

	pgDump.stderr?.on('data', (data) =>
	{
		errorOutput += data.toString();
	});

	pgDump.on('close', async (code) =>
	{
		if (code === 0)
		{
			const stats = await fs.stat(filename);
			const size = formatBytes(stats.size);

			spinner.succeed('Backup created');
			console.log(chalk.green(`\n✅ Backup created successfully`));
			console.log(chalk.gray(`   File: ${filename}`));
			console.log(chalk.gray(`   Size: ${size}`));

			// Collect and save metadata
			console.log(chalk.dim('\n📋 Collecting metadata...'));

			const [gitInfo, migrationInfo] = await Promise.all([
				collectGitInfo(),
				collectMigrationInfo(dbUrl)
			]);

			// Prepare tags array
			const tags: string[] = [];
			if (options.tag)
			{
				tags.push(...options.tag.split(',').map(t => t.trim()));
			}

			const metadata: BackupMetadata = {
				timestamp: new Date().toISOString(),
				database: dbInfo.database,
				environment: options.env || process.env.NODE_ENV,
				git: gitInfo,
				migrations: migrationInfo,
				backup: {
					filename: path.basename(filename),
					format: format as 'sql' | 'custom',
					sizeBytes: stats.size,
					schema: options.schema,
					dataOnly: options.dataOnly,
					schemaOnly: options.schemaOnly
				},
				tags: tags.length > 0 ? tags : undefined
			};

			await saveBackupMetadata(metadata, filename);
		}
		else
		{
			spinner.fail('Backup failed');
			console.error(chalk.red('\n❌ Failed to create backup'));

			if (errorOutput.includes('pg_dump: command not found') || errorOutput.includes('not found'))
			{
				console.error(chalk.yellow('\n💡 pg_dump is not installed. Please install PostgreSQL client tools.'));
			}
			else if (errorOutput)
			{
				console.error(chalk.red(errorOutput));
			}

			process.exit(1);
		}
	});

	pgDump.on('error', (error) =>
	{
		spinner.fail('Backup failed');
		console.error(chalk.red('\n❌ Failed to start pg_dump'));
		console.error(chalk.red(error.message));
		process.exit(1);
	});
}

/**
 * Restore database from backup file
 */
async function dbRestore(backupFile?: string, options: { drop?: boolean; schema?: string; dataOnly?: boolean; schemaOnly?: boolean } = {}): Promise<void>
{
	console.log(chalk.blue('♻️  Restoring database from backup...\n'));

	// Load environment variables
	const { loadEnvironment } = await import('@spfn/core/env');
	loadEnvironment({ debug: false });

	const dbUrl = process.env.DATABASE_URL;

	if (!dbUrl)
	{
		console.error(chalk.red('❌ DATABASE_URL not found in environment'));
		console.log(chalk.yellow('\n💡 Tip: Add DATABASE_URL to your .env file'));
		process.exit(1);
	}

	let file = backupFile;

	// If no file specified, show list and let user select
	if (!file)
	{
		const backups = await listBackupFiles();

		if (backups.length === 0)
		{
			console.log(chalk.yellow('No backups found in ./backups directory'));
			process.exit(0);
		}

		const { selected } = await prompts({
			type: 'select',
			name: 'selected',
			message: 'Select backup to restore:',
			choices: backups.map(b => ({
				title: `${b.name} (${b.size})`,
				value: b.path,
			})),
		});

		if (!selected)
		{
			console.log(chalk.gray('Cancelled'));
			process.exit(0);
		}

		file = selected;
	}

	// Type guard to ensure file is defined
	if (!file)
	{
		console.error(chalk.red('❌ No backup file selected'));
		process.exit(1);
	}

	// Load and check backup metadata
	const metadata = await loadBackupMetadata(file);

	if (metadata)
	{
		console.log(chalk.blue('\n📋 Backup Information:\n'));
		console.log(chalk.dim(`  Database: ${metadata.database}`));
		console.log(chalk.dim(`  Created: ${new Date(metadata.timestamp).toLocaleString()}`));

		if (metadata.environment)
		{
			console.log(chalk.dim(`  Environment: ${metadata.environment}`));
		}

		if (metadata.tags && metadata.tags.length > 0)
		{
			console.log(chalk.dim(`  Tags: ${metadata.tags.join(', ')}`));
		}

		if (metadata.backup.dataOnly)
		{
			console.log(chalk.yellow('  ⚠️  Data-only backup (no schema)'));
		}

		if (metadata.backup.schemaOnly)
		{
			console.log(chalk.yellow('  ⚠️  Schema-only backup (no data)'));
		}

		// Check version compatibility
		const warnings: string[] = [];

		// Get current git and migration info
		const [currentGitInfo, currentMigrationInfo] = await Promise.all([
			collectGitInfo(),
			collectMigrationInfo(dbUrl)
		]);

		// Check Git version mismatch
		if (metadata.git && currentGitInfo)
		{
			if (metadata.git.commit !== currentGitInfo.commit)
			{
				warnings.push(`Git commit mismatch: backup from ${metadata.git.commit.substring(0, 7)}, current is ${currentGitInfo.commit.substring(0, 7)}`);
			}

			if (metadata.git.branch !== currentGitInfo.branch)
			{
				warnings.push(`Git branch mismatch: backup from '${metadata.git.branch}', current is '${currentGitInfo.branch}'`);
			}
		}

		// Check Migration version mismatch
		if (metadata.migrations && currentMigrationInfo)
		{
			if (metadata.migrations.hash !== currentMigrationInfo.hash)
			{
				warnings.push(`Migration version mismatch: backup has ${metadata.migrations.count} migrations, current has ${currentMigrationInfo.count}`);
				warnings.push(`  Last migration in backup: ${metadata.migrations.hash}`);
				warnings.push(`  Current last migration: ${currentMigrationInfo.hash}`);
			}
		}

		if (warnings.length > 0)
		{
			console.log(chalk.yellow('\n⚠️  Version Warnings:\n'));
			warnings.forEach(warning => console.log(chalk.yellow(`  - ${warning}`)));
			console.log('');
		}
	}

	// Confirm before restore
	const { confirm } = await prompts({
		type: 'confirm',
		name: 'confirm',
		message: chalk.yellow('⚠️  This will replace all data in the database. Continue?'),
		initial: false,
	});

	if (!confirm)
	{
		console.log(chalk.gray('Cancelled'));
		process.exit(0);
	}

	// Validate mutually exclusive options
	if (options.dataOnly && options.schemaOnly)
	{
		console.error(chalk.red('❌ Cannot use --data-only and --schema-only together'));
		process.exit(1);
	}

	// Parse connection info
	const dbInfo = parseDatabaseUrl(dbUrl);

	// Check file format
	const ext = path.extname(file);
	const isCustomFormat = ext === '.dump';

	// Build restore command
	const command = isCustomFormat ? 'pg_restore' : 'psql';
	const args: string[] = [];

	if (isCustomFormat)
	{
		args.push('-h', dbInfo.host);
		args.push('-p', dbInfo.port);
		args.push('-U', dbInfo.user);
		args.push('-d', dbInfo.database);

		if (options.drop)
		{
			args.push('--clean');
		}

		if (options.schema)
		{
			args.push('-n', options.schema);
		}

		if (options.dataOnly)
		{
			args.push('--data-only');
		}

		if (options.schemaOnly)
		{
			args.push('--schema-only');
		}

		args.push(file);
	}
	else
	{
		// For plain SQL files, --data-only and --schema-only are not directly supported
		// The backup file itself should have been created with these options
		if (options.dataOnly || options.schemaOnly)
		{
			console.log(chalk.yellow('⚠️  Note: --data-only and --schema-only options only work with custom format backups (.dump)'));
			console.log(chalk.yellow('    For SQL files, the backup must have been created with the desired option.\n'));
		}

		args.push('-h', dbInfo.host);
		args.push('-p', dbInfo.port);
		args.push('-U', dbInfo.user);
		args.push('-d', dbInfo.database);
		args.push('-f', file);
	}

	// Execute restore
	const spinner = ora('Restoring backup...').start();

	const restoreProcess = spawn(command, args, {
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			PGPASSWORD: dbInfo.password,
		},
	});

	let errorOutput = '';

	restoreProcess.stderr?.on('data', (data) =>
	{
		errorOutput += data.toString();
	});

	restoreProcess.on('close', (code) =>
	{
		if (code === 0)
		{
			spinner.succeed('Restore completed');
			console.log(chalk.green('\n✅ Database restored successfully'));
		}
		else
		{
			spinner.fail('Restore failed');
			console.error(chalk.red('\n❌ Failed to restore database'));

			if (errorOutput)
			{
				console.error(chalk.red(errorOutput));
			}

			process.exit(1);
		}
	});

	restoreProcess.on('error', (error) =>
	{
		spinner.fail('Restore failed');
		console.error(chalk.red(`\n❌ Failed to start ${command}`));
		console.error(chalk.red(error.message));
		process.exit(1);
	});
}

/**
 * List all database backups
 */
async function dbBackupList(): Promise<void>
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

/**
 * Clean old backups
 */
async function dbBackupClean(options: {
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
		await Promise.all(toDelete.map(backup => fs.unlink(backup.path)));

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