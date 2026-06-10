import chalk from 'chalk';
import prompts from 'prompts';
import { env } from '@spfn/core/config';
import { loadEnv } from '@spfn/core/server';
import { runWithSpinner } from './utils/drizzle.js';
import { parseDatabaseUrl, confirmDangerousTarget } from './utils/database.js';

/**
 * Drop all database tables (dangerous!)
 */
export async function dbDrop(): Promise<void>
{
    loadEnv();

    if (!env.DATABASE_URL)
    {
        console.error(chalk.red('❌ DATABASE_URL not found in environment'));
        console.log(chalk.yellow('\n💡 Tip: Add DATABASE_URL to your .env file'));
        process.exit(1);
    }

    const dbInfo = parseDatabaseUrl(env.DATABASE_URL);

    console.log(chalk.yellow('⚠️  WARNING: This will drop all tables in your database!'));
    console.log(chalk.dim(`   Target: ${dbInfo.database} @ ${dbInfo.host}:${dbInfo.port}\n`));

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

    await confirmDangerousTarget(dbInfo);

    await runWithSpinner(
        'Dropping all tables...',
        'drop',
        'All tables dropped',
        'Failed to drop tables'
    );
}