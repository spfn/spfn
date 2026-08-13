/**
 * `spfn cloud limits` — what the free plans allow, printed from the dated constants
 * table in `utils/cloud/limits-data.ts`. Works before `spfn cloud link`: neither
 * provider exposes a Hobby/Free limits API worth depending on, so this is the
 * reference card, and `spfn cloud status` is where live usage meets these numbers.
 */

import chalk from 'chalk';
import {
    VERCEL_HOBBY_LIMITS,
    SUPABASE_FREE_LIMITS,
    VERCEL_HOBBY_NOTES,
    SUPABASE_FREE_NOTES,
    LIMITS_VERIFIED_ON,
    type PlanLimit,
} from '../../utils/cloud/limits-data.js';
import { formatCount } from '../../utils/cloud/format.js';

const PER_LABEL: Record<PlanLimit['per'], string> = {
    month: '/ month',
    day: '/ day',
    concurrent: 'concurrent',
    total: 'total',
};

export async function cloudLimits(): Promise<void>
{
    printPlan('Vercel Hobby', VERCEL_HOBBY_LIMITS, VERCEL_HOBBY_NOTES);
    printPlan('Supabase Free', SUPABASE_FREE_LIMITS, SUPABASE_FREE_NOTES);

    console.log(chalk.dim(`Numbers verified against the official docs on ${LIMITS_VERIFIED_ON}.`));
    console.log(chalk.dim('Live usage against these limits: `spfn cloud status`.\n'));
}

function printPlan(title: string, limits: PlanLimit[], notes: string[]): void
{
    console.log(chalk.bold(`\n${title}`));

    for (const limit of limits)
    {
        const amount = `${formatCount(limit.limit)} ${limit.unit}`;
        console.log(`  ${limit.label.padEnd(34)} ${amount.padEnd(26)} ${chalk.dim(PER_LABEL[limit.per])}`);
    }

    for (const note of notes)
    {
        console.log(chalk.dim(`  • ${note}`));
    }

    console.log('');
}
