import chalk from 'chalk';
import prompts from 'prompts';
import { runWithSpinner } from './utils/drizzle.js';

/**
 * Drop all database tables (dangerous!)
 */
export async function dbDrop(): Promise<void>
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