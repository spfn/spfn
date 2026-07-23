import chalk from 'chalk';
import ora from 'ora';
import { runDrizzleCommand } from './utils/drizzle.js';

/**
 * Check migration file consistency (drizzle-kit check).
 * For applied/pending migration state, use `spfn db status`.
 */
export async function dbCheck(): Promise<void>
{
    const spinner = ora('Checking migration files...').start();

    try
    {
        await runDrizzleCommand('check');
        spinner.succeed('Migration files consistent');
    }
    catch (error)
    {
        spinner.fail('Migration file check failed');
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
    }
}
