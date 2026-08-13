/**
 * `spfn cloud status` — one screen: usage measured against the free-plan limits,
 * with a migration prompt on anything at or past 80% of its limit. This threshold
 * line is the product's upsell surface: the CLI is where a student first learns
 * their free tier is running out.
 */

import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { collectSnapshot, matchVercelLimit, isSupabasePaused, type CloudSnapshot } from './collect.js';
import { usageLine, isNearLimit, formatBytes, formatCount, sameUnit, BYTES_PER_MB } from '../../utils/cloud/format.js';
import { SUPABASE_FREE_LIMITS, LIMITS_VERIFIED_ON } from '../../utils/cloud/limits-data.js';

export async function cloudStatus(): Promise<void>
{
    const snapshot = await collectSnapshot(process.cwd());
    const nearLimit: string[] = [];

    printVercel(snapshot, nearLimit);
    printSupabase(snapshot, nearLimit);

    console.log('');

    for (const problem of snapshot.problems)
    {
        logger.warn(problem);
    }

    printMigrationPrompt(nearLimit);

    if (!snapshot.vercel && !snapshot.supabase)
    {
        process.exit(1);
    }
}

function printVercel(snapshot: CloudSnapshot, nearLimit: string[]): void
{
    if (!snapshot.vercel)
    {
        return;
    }

    console.log(chalk.bold(`\nVercel Hobby — ${snapshot.vercel.projectName} (rolling 30 days, limits as of ${LIMITS_VERIFIED_ON})`));

    if (snapshot.vercel.services.length === 0)
    {
        console.log(chalk.dim('  No usage recorded in the billing feed yet.'));
    }

    for (const service of snapshot.vercel.services)
    {
        const limit = matchVercelLimit(service.serviceName);

        // A unit mismatch (feed says MB, limit says GB) would make the percentage
        // nonsense — show the raw number rather than a silently wrong ratio.
        if (!limit || !sameUnit(service.unit, limit.unit))
        {
            console.log(`  ${service.serviceName.padEnd(34)} ${formatCount(service.consumed)} ${service.unit}`.trimEnd());
            continue;
        }

        console.log(usageLine(limit.label, service.consumed, limit.limit, limit.unit));

        if (isNearLimit(service.consumed, limit.limit))
        {
            nearLimit.push(`Vercel ${limit.label}`);
        }
    }
}

function printSupabase(snapshot: CloudSnapshot, nearLimit: string[]): void
{
    if (!snapshot.supabase)
    {
        return;
    }

    const { projectName, status, dbSizeBytes, dailyApiCount } = snapshot.supabase;

    console.log(chalk.bold(`\nSupabase Free — ${projectName}`));

    if (isSupabasePaused(status))
    {
        console.log(`  ${'Project status'.padEnd(34)} ${chalk.red.bold(status)} — run \`spfn cloud keepalive\` after restoring it`);
    }
    else
    {
        console.log(`  ${'Project status'.padEnd(34)} ${chalk.green(status)}`);
    }

    if (dbSizeBytes !== null)
    {
        const dbLimit = SUPABASE_FREE_LIMITS.find(l => l.key === 'db-size')!;
        const usedMb = dbSizeBytes / BYTES_PER_MB;

        console.log(usageLine(dbLimit.label, usedMb, dbLimit.limit, dbLimit.unit));

        if (isNearLimit(usedMb, dbLimit.limit))
        {
            nearLimit.push('Supabase database size');
        }
    }
    else
    {
        console.log(`  ${'Database size'.padEnd(34)} ${chalk.dim('unavailable')}`);
    }

    console.log(`  ${'API requests (last 24h)'.padEnd(34)} ${dailyApiCount === null ? chalk.dim('unavailable') : formatCount(dailyApiCount)}`);
    console.log(chalk.dim(`  DB size ${dbSizeBytes === null ? 'unknown' : formatBytes(dbSizeBytes)} counts per project; egress/MAU are org totals — exact numbers on the dashboard.`));
}

function printMigrationPrompt(nearLimit: string[]): void
{
    if (nearLimit.length === 0)
    {
        return;
    }

    console.log(chalk.yellow.bold(`⚠ Approaching free-tier limits: ${nearLimit.join(', ')}.`));
    console.log(chalk.yellow('  When a Vercel Hobby limit is hit, that capability pauses; Supabase over quota restricts the whole org.'));
    console.log(chalk.yellow('  Migrating to your own cloud removes these ceilings — `spfn cloud migrate` (coming soon).\n'));
}
