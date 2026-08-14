/**
 * Rendering helpers for `spfn cloud` output — usage lines, percentages, sizes.
 *
 * The 80% threshold is where the migration prompt appears; 100% is where the
 * provider starts pausing capabilities, so the coloring warns one step earlier.
 */

import chalk from 'chalk';

export const MIGRATION_PROMPT_THRESHOLD = 0.8;

export function formatPercent(used: number, limit: number): string
{
    if (limit <= 0)
    {
        return chalk.dim('n/a');
    }

    const ratio = used / limit;
    const text = `${(ratio * 100).toFixed(1)}%`;

    if (ratio >= 1)
    {
        return chalk.red.bold(text);
    }

    if (ratio >= MIGRATION_PROMPT_THRESHOLD)
    {
        return chalk.yellow.bold(text);
    }

    return chalk.green(text);
}

export function isNearLimit(used: number, limit: number): boolean
{
    return limit > 0 && used / limit >= MIGRATION_PROMPT_THRESHOLD;
}

/** Decimal (1000-based), matching how both providers state their limits (500 MB, 5 GB). */
export const BYTES_PER_MB = 1_000_000;

export function formatBytes(bytes: number): string
{
    if (bytes < 1_000) return `${bytes} B`;
    if (bytes < BYTES_PER_MB) return `${(bytes / 1_000).toFixed(1)} KB`;
    if (bytes < 1_000 * BYTES_PER_MB) return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;

    return `${(bytes / (1_000 * BYTES_PER_MB)).toFixed(2)} GB`;
}

/**
 * Whether a provider-reported unit and our limit's unit describe the same thing.
 * An empty provider unit is treated as agreement; a real mismatch means the
 * percentage would be nonsense and the caller should not compute one.
 */
export function sameUnit(reported: string, limitUnit: string): boolean
{
    return reported === '' || reported.trim().toLowerCase() === limitUnit.trim().toLowerCase();
}

export function formatCount(value: number): string
{
    return value.toLocaleString('en-US');
}

/** One aligned `label  used / limit unit  percent` line. */
export function usageLine(label: string, used: number, limit: number, unit: string): string
{
    const percent = formatPercent(used, limit);
    const amounts = `${formatCount(round(used))} / ${formatCount(limit)} ${unit}`;

    return `  ${label.padEnd(34)} ${amounts.padEnd(32)} ${percent}`;
}

function round(value: number): number
{
    return Number.isInteger(value) ? value : Number(value.toFixed(2));
}
