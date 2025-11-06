/**
 * Database Sync Utilities
 *
 * Helper functions for syncing databases between environments
 */

import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Database connection info
 */
export interface DbConnectionInfo
{
	host: string;
	port: string;
	user: string;
	password: string;
	database: string;
}

/**
 * Sync environment configuration
 */
export interface SyncEnvironment
{
	name: string;
	url: string;
	connection: DbConnectionInfo;
}

/**
 * Parse DATABASE_URL into connection info
 */
export function parseDatabaseUrl(dbUrl: string): DbConnectionInfo
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
 * Get target environment URL from SPFN_DB_* env vars
 */
export function getTargetDatabaseUrl(target: string): string | undefined
{
	const envKey = `SPFN_DB_${target.toUpperCase()}`;
	return process.env[envKey];
}

/**
 * Validate sync environments
 */
export async function validateSyncEnvironments(source: string, target: string): Promise<{
	source: SyncEnvironment;
	target: SyncEnvironment;
}>
{
	// Get source URL (default DATABASE_URL)
	const sourceUrl = source === 'local' ? process.env.DATABASE_URL : getTargetDatabaseUrl(source);

	if (!sourceUrl)
	{
		if (source === 'local')
		{
			throw new Error('DATABASE_URL not found in environment');
		}
		else
		{
			throw new Error(`SPFN_DB_${source.toUpperCase()} not found in environment`);
		}
	}

	// Get target URL
	const targetUrl = target === 'local' ? process.env.DATABASE_URL : getTargetDatabaseUrl(target);

	if (!targetUrl)
	{
		if (target === 'local')
		{
			throw new Error('DATABASE_URL not found in environment');
		}
		else
		{
			throw new Error(`SPFN_DB_${target.toUpperCase()} not found in environment`);
		}
	}

	// Prevent syncing to the same database
	if (sourceUrl === targetUrl)
	{
		throw new Error('Source and target databases are the same');
	}

	return {
		source: {
			name: source,
			url: sourceUrl,
			connection: parseDatabaseUrl(sourceUrl)
		},
		target: {
			name: target,
			url: targetUrl,
			connection: parseDatabaseUrl(targetUrl)
		}
	};
}

/**
 * Test database connection
 */
export async function testDatabaseConnection(env: SyncEnvironment): Promise<boolean>
{
	try
	{
		const { Pool } = await import('pg');
		const pool = new Pool({ connectionString: env.url });

		try
		{
			await pool.query('SELECT 1');
			return true;
		}
		finally
		{
			await pool.end();
		}
	}
	catch (error)
	{
		return false;
	}
}

/**
 * Get database size and table count
 */
export async function getDatabaseInfo(env: SyncEnvironment): Promise<{
	size: string;
	tableCount: number;
}>
{
	try
	{
		const { Pool } = await import('pg');
		const pool = new Pool({ connectionString: env.url });

		try
		{
			// Get database size
			const sizeResult = await pool.query(`
				SELECT pg_size_pretty(pg_database_size(current_database())) as size;
			`);

			// Get table count
			const tableResult = await pool.query(`
				SELECT COUNT(*) as count
				FROM information_schema.tables
				WHERE table_schema = 'public'
				AND table_type = 'BASE TABLE';
			`);

			return {
				size: sizeResult.rows[0].size,
				tableCount: parseInt(tableResult.rows[0].count)
			};
		}
		finally
		{
			await pool.end();
		}
	}
	catch (error)
	{
		return {
			size: 'unknown',
			tableCount: 0
		};
	}
}

/**
 * Check if environment is production-like
 */
export function isProductionLike(envName: string): boolean
{
	const prodPatterns = ['prod', 'production', 'live', 'main'];
	const lowerName = envName.toLowerCase();

	return prodPatterns.some(pattern => lowerName.includes(pattern));
}

/**
 * Get available sync targets
 */
export function getAvailableSyncTargets(): string[]
{
	const targets: string[] = [];

	// Check for SPFN_DB_* environment variables
	Object.keys(process.env).forEach(key =>
	{
		if (key.startsWith('SPFN_DB_'))
		{
			const target = key.replace('SPFN_DB_', '').toLowerCase();
			targets.push(target);
		}
	});

	return targets.sort();
}