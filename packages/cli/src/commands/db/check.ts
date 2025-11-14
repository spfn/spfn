import chalk from 'chalk';
import ora from 'ora';
import { runDrizzleCommand } from './utils/drizzle.js';

/**
 * Check database connection
 */
export async function dbCheck(): Promise<void>
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