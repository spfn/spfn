import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';
import { loadEnvironment } from "@spfn/core/env";
import { formatTimestamp } from './utils/formatters.js';
import { dbBackup } from './backup.js';

/**
 * Sync database between environments
 */
export async function dbSync(target: string, options: {
	pull?: boolean;
	tables?: string;
	excludeTables?: string;
	dataOnly?: boolean;
	schemaOnly?: boolean;
	force?: boolean;
	dryRun?: boolean;
	yes?: boolean;
}): Promise<void>
{
	console.log(chalk.blue('🔄 Database sync\n'));

	// Load environment variables
	loadEnvironment({ debug: false });

	const {
		validateSyncEnvironments,
		testDatabaseConnection,
		getDatabaseInfo,
		isProductionLike,
		getAvailableSyncTargets
	} = await import('../../utils/db-sync.js');

	// Determine source and target based on --pull option
	const sourceName = options.pull ? target : 'local';
	const targetName = options.pull ? 'local' : target;

	// Validate environments
	let source, targetEnv;
	try
	{
		const envs = await validateSyncEnvironments(sourceName, targetName);
		source = envs.source;
		targetEnv = envs.target;
	}
	catch (error)
	{
		console.error(chalk.red(`❌ ${error instanceof Error ? error.message : 'Environment validation failed'}`));

		// Show available targets
		const available = getAvailableSyncTargets();
		if (available.length > 0)
		{
			console.log(chalk.yellow(`\n💡 Available sync targets: ${available.join(', ')}`));
			console.log(chalk.dim(`   Configure in .env: SPFN_DB_${target.toUpperCase()}=postgresql://...`));
		}
		else
		{
			console.log(chalk.yellow('\n💡 No sync targets configured'));
			console.log(chalk.dim('   Add to .env: SPFN_DB_DEV=postgresql://...'));
		}

		process.exit(1);
	}

	// Production protection
	if (isProductionLike(targetEnv.name) && !options.force)
	{
		console.error(chalk.red(`❌ Cannot sync to production-like environment '${targetEnv.name}' without --force flag`));
		console.log(chalk.yellow('   This is a safety measure to prevent accidental data loss'));
		console.log(chalk.dim('   Use --force if you really want to do this'));
		process.exit(1);
	}

	// Test connections
	console.log(chalk.dim('Testing database connections...'));

	const spinner = ora('Connecting to source database...').start();
	const sourceConnected = await testDatabaseConnection(source);

	if (!sourceConnected)
	{
		spinner.fail('Failed to connect to source database');
		console.error(chalk.red(`❌ Cannot connect to ${source.name} database`));
		process.exit(1);
	}

	spinner.text = 'Connecting to target database...';
	const targetConnected = await testDatabaseConnection(targetEnv);

	if (!targetConnected)
	{
		spinner.fail('Failed to connect to target database');
		console.error(chalk.red(`❌ Cannot connect to ${targetEnv.name} database`));
		process.exit(1);
	}

	spinner.succeed('Database connections OK');

	// Collect database info
	console.log(chalk.dim('\nCollecting database information...'));

	const [sourceInfo, targetInfo] = await Promise.all([
		getDatabaseInfo(source),
		getDatabaseInfo(targetEnv)
	]);

	// Display sync plan
	console.log(chalk.blue('\n📋 Sync Plan:\n'));
	console.log(chalk.white(`  Source:  ${chalk.cyan(source.name)} (${source.connection.database})`));
	console.log(chalk.dim(`           ${sourceInfo.tableCount} tables, ${sourceInfo.size}`));
	console.log('');
	console.log(chalk.white(`  Target:  ${chalk.yellow(targetEnv.name)} (${targetEnv.connection.database})`));
	console.log(chalk.dim(`           ${targetInfo.tableCount} tables, ${targetInfo.size}`));
	console.log('');

	// Options summary
	if (options.tables)
	{
		console.log(chalk.dim(`  Tables: ${options.tables}`));
	}

	if (options.excludeTables)
	{
		console.log(chalk.dim(`  Exclude: ${options.excludeTables}`));
	}

	if (options.dataOnly)
	{
		console.log(chalk.yellow('  ⚠️  Data only (schema will not be changed)'));
	}

	if (options.schemaOnly)
	{
		console.log(chalk.yellow('  ⚠️  Schema only (data will not be changed)'));
	}

	console.log(chalk.yellow('\n  ⚠️  Target database will be completely replaced!'));
	console.log(chalk.dim('  ℹ️  Target will be backed up before sync\n'));

	// Dry run
	if (options.dryRun)
	{
		console.log(chalk.green('✅ Dry run complete (no changes made)'));
		return;
	}

	// Confirmation (skip if --yes flag is provided)
	if (!options.yes)
	{
		const { confirm } = await prompts({
			type: 'confirm',
			name: 'confirm',
			message: chalk.yellow(`Sync ${source.name} → ${targetEnv.name}?`),
			initial: false,
		});

		if (!confirm)
		{
			console.log(chalk.gray('Cancelled'));
			process.exit(0);
		}
	}

	// Step 1: Backup target (required)
	console.log(chalk.blue('\n📦 Step 1/4: Creating target backup...\n'));

	// Temporarily set DATABASE_URL to target for backup
	const originalDatabaseUrl = process.env.DATABASE_URL;
	process.env.DATABASE_URL = targetEnv.url;

	try
	{
		await dbBackup({
			format: 'custom',
			tag: `pre-sync-from-${source.name}`,
			env: targetEnv.name
		});
	}
	finally
	{
		// Restore original DATABASE_URL
		process.env.DATABASE_URL = originalDatabaseUrl;
	}

	// Step 2: Dump source to temp file
	console.log(chalk.blue('\n📤 Step 2/4: Dumping source database...'));

	const tempDir = path.join(process.cwd(), 'backups');
	const timestamp = formatTimestamp();
	const tempDumpFile = path.join(tempDir, `_temp_sync_${timestamp}.dump`);

	const dumpSpinner = ora('Creating source dump...').start();

	const dumpArgs = [
		'-h', source.connection.host,
		'-p', source.connection.port,
		'-U', source.connection.user,
		'-d', source.connection.database,
		'-f', tempDumpFile,
		'-Fc', // Custom format
	];

	if (options.tables)
	{
		const tables = options.tables.split(',').map(t => t.trim());
		tables.forEach(table =>
		{
			dumpArgs.push('-t', table);
		});
	}

	if (options.excludeTables)
	{
		const tables = options.excludeTables.split(',').map(t => t.trim());
		tables.forEach(table =>
		{
			dumpArgs.push('-T', table);
		});
	}

	if (options.dataOnly)
	{
		dumpArgs.push('--data-only');
	}

	if (options.schemaOnly)
	{
		dumpArgs.push('--schema-only');
	}

	const dumpProcess = spawn('pg_dump', dumpArgs, {
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			PGPASSWORD: source.connection.password,
		},
	});

	let dumpError = '';
	dumpProcess.stderr?.on('data', (data) =>
	{
		dumpError += data.toString();
	});

	await new Promise<void>((resolve, reject) =>
	{
		dumpProcess.on('close', (code) =>
		{
			if (code === 0)
			{
				dumpSpinner.succeed('Source dump created');
				resolve();
			}
			else
			{
				dumpSpinner.fail('Source dump failed');
				reject(new Error(dumpError || 'pg_dump failed'));
			}
		});

		dumpProcess.on('error', (error) =>
		{
			dumpSpinner.fail('Source dump failed');
			reject(error);
		});
	}).catch((error) =>
	{
		console.error(chalk.red(`\n❌ ${error instanceof Error ? error.message : 'Failed to dump source'}`));
		process.exit(1);
	});

	// Step 3: Restore to target
	console.log(chalk.blue('\n📥 Step 3/4: Restoring to target database...'));

	const restoreSpinner = ora('Restoring to target...').start();

	const restoreArgs = [
		'-h', targetEnv.connection.host,
		'-p', targetEnv.connection.port,
		'-U', targetEnv.connection.user,
		'-d', targetEnv.connection.database,
		'--clean', // Drop existing objects
		'--if-exists', // Don't error if objects don't exist
	];

	if (options.dataOnly)
	{
		restoreArgs.push('--data-only');
	}

	if (options.schemaOnly)
	{
		restoreArgs.push('--schema-only');
	}

	restoreArgs.push(tempDumpFile);

	const restoreProcess = spawn('pg_restore', restoreArgs, {
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			PGPASSWORD: targetEnv.connection.password,
		},
	});

	let restoreError = '';
	restoreProcess.stderr?.on('data', (data) =>
	{
		restoreError += data.toString();
	});

	await new Promise<void>((resolve, reject) =>
	{
		restoreProcess.on('close', (code) =>
		{
			if (code === 0)
			{
				restoreSpinner.succeed('Target restored');
				resolve();
			}
			else
			{
				restoreSpinner.fail('Target restore failed');
				reject(new Error(restoreError || 'pg_restore failed'));
			}
		});

		restoreProcess.on('error', (error) =>
		{
			restoreSpinner.fail('Target restore failed');
			reject(error);
		});
	}).catch((error) =>
	{
		console.error(chalk.red(`\n❌ ${error instanceof Error ? error.message : 'Failed to restore target'}`));
		console.log(chalk.yellow('\n💡 You can restore the target from the backup created in Step 1'));
		process.exit(1);
	});

	// Step 4: Cleanup
	console.log(chalk.blue('\n🧹 Step 4/4: Cleaning up...'));

	try
	{
		await fs.unlink(tempDumpFile);
		console.log(chalk.dim('✓ Temporary files deleted'));
	}
	catch (error)
	{
		console.log(chalk.dim('⚠️  Could not delete temporary dump file'));
	}

	// Success
	console.log(chalk.green(`\n✅ Sync completed successfully!`));
	console.log(chalk.dim(`   ${source.name} → ${targetEnv.name}`));
	console.log('');
}