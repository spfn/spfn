/**
 * `spfn cloud usage` — raw current usage per provider, without limit judgement
 * (that is `spfn cloud status`). Supabase org-level totals (egress, MAU) have no
 * public API, so the report says so and points at the dashboard instead of
 * printing a number it cannot back.
 */

import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { collectSnapshot, type CloudSnapshot } from './collect.js';
import { formatBytes, formatCount } from '../../utils/cloud/format.js';

export async function cloudUsage(): Promise<void>
{
    const snapshot = await collectSnapshot(process.cwd());

    printVercel(snapshot);
    printSupabase(snapshot);
    printProblems(snapshot);
}

function printVercel(snapshot: CloudSnapshot): void
{
    if (!snapshot.vercel)
    {
        return;
    }

    console.log(chalk.bold(`\nVercel — account-wide usage, rolling 30 days (linked project: ${snapshot.vercel.projectName})`));

    if (snapshot.vercel.services.length === 0)
    {
        console.log(chalk.dim('  No usage recorded in the billing feed yet.'));
    }

    for (const service of snapshot.vercel.services)
    {
        const amount = `${formatCount(service.consumed)} ${service.unit}`.trim();
        console.log(`  ${service.serviceName.padEnd(34)} ${amount}`);
    }
}

function printSupabase(snapshot: CloudSnapshot): void
{
    if (!snapshot.supabase)
    {
        return;
    }

    const { projectName, status, dbSizeBytes, dailyApiCount } = snapshot.supabase;

    console.log(chalk.bold(`\nSupabase — ${projectName}`));
    console.log(`  ${'Project status'.padEnd(34)} ${status}`);
    console.log(`  ${'Database size'.padEnd(34)} ${dbSizeBytes === null ? chalk.dim('unavailable') : formatBytes(dbSizeBytes)}`);
    console.log(`  ${'API requests (last 24h)'.padEnd(34)} ${dailyApiCount === null ? chalk.dim('unavailable') : formatCount(dailyApiCount)}`);
    console.log(chalk.dim('  Org totals (egress, MAU) have no public API — exact numbers: supabase.com/dashboard → Usage.'));
}

function printProblems(snapshot: CloudSnapshot): void
{
    console.log('');

    for (const problem of snapshot.problems)
    {
        logger.warn(problem);
    }

    if (snapshot.problems.length > 0 && !snapshot.vercel && !snapshot.supabase)
    {
        process.exit(1);
    }
}
