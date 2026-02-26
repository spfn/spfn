/**
 * Push Display Formatting
 *
 * Console output helpers for `spfn db push` safe mode.
 */

import chalk from 'chalk';
import type { ClassificationResult, ClassifiedStatement } from './sql-classifier.js';

// ============================================================================
// Helpers
// ============================================================================

function formatSql(sql: string): string
{
    // Trim and collapse whitespace for display
    return sql.replace(/\s+/g, ' ').trim();
}

function printStatements(statements: ClassifiedStatement[], color: typeof chalk): void
{
    for (const stmt of statements)
    {
        console.log(color(`   ${formatSql(stmt.sql)}`));
        if (stmt.reason)
        {
            console.log(chalk.dim(`   → ${stmt.reason}`));
        }
    }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Display classified SQL statements with color-coded categories
 */
export function displayClassifiedStatements(result: ClassificationResult): void
{
    if (result.safe.length > 0)
    {
        console.log(chalk.green(`\n✅ Safe changes (${result.safe.length}):`));
        printStatements(result.safe, chalk.green);
    }

    if (result.warning.length > 0)
    {
        console.log(chalk.yellow(`\n⚠️  Warnings (${result.warning.length}):`));
        printStatements(result.warning, chalk.yellow);
    }

    if (result.destructive.length > 0)
    {
        console.log(chalk.red(`\n❌ Destructive changes (${result.destructive.length}):`));
        printStatements(result.destructive, chalk.red);
    }
}

/**
 * Display dry-run summary header + classified statements
 */
export function displayDryRunSummary(result: ClassificationResult): void
{
    const total = result.safe.length + result.warning.length + result.destructive.length;
    console.log(chalk.cyan(`\n🔍 Dry-run: ${total} statement(s) detected\n`));
    displayClassifiedStatements(result);
    console.log('');
}

/**
 * Display apply result summary
 */
export function displayApplySummary(applied: number, skipped: number): void
{
    if (applied > 0)
    {
        console.log(chalk.green(`\n✅ Applied ${applied} statement(s)`));
    }

    if (skipped > 0)
    {
        console.log(chalk.yellow(`⏭️  Skipped ${skipped} destructive statement(s)`));
    }

    console.log('');
}
