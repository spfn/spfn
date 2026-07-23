import chalk from 'chalk';

import { validateDatabasePrerequisites } from './utils/drizzle.js';
import { getMigrationStatus } from '../../utils/migration-status.js';

/**
 * Show applied/pending migration status for function packages and the project.
 *
 * Entry point for "why are the package tables missing?" — reports what
 * `spfn db migrate` would apply, without touching the database.
 */
export async function dbStatus(): Promise<void>
{
    try
    {
        validateDatabasePrerequisites();
    }
    catch (error)
    {
        // Error already logged in validateDatabasePrerequisites
        process.exit(1);
    }

    let status;

    try
    {
        status = await getMigrationStatus(process.cwd());
    }
    catch (error)
    {
        console.error(chalk.red('❌ Failed to read migration status'));
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
    }

    const targets = [...status.packages, ...(status.project ? [status.project] : [])];

    if (targets.length === 0)
    {
        console.log(chalk.dim('No migrations found (no @spfn packages with migrations, no src/server/drizzle).'));

        return;
    }

    console.log(chalk.blue('📦 Migration status:\n'));

    for (const target of targets)
    {
        const state = target.pending === 0
            ? chalk.green(`${target.applied}/${target.total} applied`)
            : chalk.yellow(`${target.applied}/${target.total} applied, ${target.pending} pending`);

        console.log(`  ${target.name.padEnd(32)} ${state}`);

        for (const tag of target.pendingTags)
        {
            console.log(chalk.dim(`      - ${tag}`));
        }
    }

    const pendingTotal = targets.reduce((sum, t) => sum + t.pending, 0);

    if (pendingTotal === 0)
    {
        console.log(chalk.green('\n✅ Database is up to date\n'));
    }
    else
    {
        console.log(chalk.yellow(`\n⚠️  ${pendingTotal} pending migration(s) — run: pnpm spfn db migrate\n`));
    }
}
