import { existsSync, readFileSync, writeFileSync, renameSync, copyFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

import { loadEnv } from '@spfn/core/server';

// ============================================================================
// Types
// ============================================================================

interface JournalEntry
{
    idx: number;
    version: string;
    when: number;
    tag: string;
    breakpoints: boolean;
}

interface Journal
{
    version: string;
    dialect: string;
    entries: JournalEntry[];
}

interface ReindexOptions
{
    dryRun?: boolean;
}

interface RenameAction
{
    type: 'sql' | 'snapshot';
    from: string;
    to: string;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if a tag already uses timestamp prefix (digit length > 4)
 */
function isTimestampPrefix(tag: string): boolean
{
    const prefix = tag.split('_')[0];
    return /^\d{5,}$/.test(prefix);
}

/**
 * Extract prefix and suffix from a migration tag
 * e.g. "0001_smooth_fury" → { prefix: "0001", suffix: "smooth_fury" }
 */
function parseTag(tag: string): { prefix: string; suffix: string }
{
    const underscoreIdx = tag.indexOf('_');
    if (underscoreIdx === -1)
    {
        return { prefix: tag, suffix: '' };
    }
    return {
        prefix: tag.substring(0, underscoreIdx),
        suffix: tag.substring(underscoreIdx + 1),
    };
}

// ============================================================================
// Main
// ============================================================================

/**
 * Convert migration files from sequential (index) prefix to timestamp prefix.
 *
 * Renames SQL files, snapshot files, and updates _journal.json entries
 * so that `when` values become the new file prefixes.
 */
export async function dbReindex(options: ReindexOptions = {}): Promise<void>
{
    loadEnv();

    // 1. Resolve drizzle out directory
    const { getDrizzleConfig } = await import('@spfn/core/db');
    const config = getDrizzleConfig({ disablePackageDiscovery: true });
    const outDir = config.out;

    const journalPath = join(outDir, 'meta', '_journal.json');
    if (!existsSync(journalPath))
    {
        console.error(chalk.red('❌ No _journal.json found at:'), journalPath);
        console.log(chalk.yellow('💡 Run `spfn db generate` first to create migrations'));
        process.exit(1);
    }

    // 2. Read journal
    const journal: Journal = JSON.parse(readFileSync(journalPath, 'utf-8'));

    if (journal.entries.length === 0)
    {
        console.log(chalk.yellow('No migration entries found — nothing to reindex.'));
        return;
    }

    // 3. Build rename plan
    const renames: RenameAction[] = [];
    const tagUpdates: Array<{ idx: number; oldTag: string; newTag: string }> = [];
    let skipped = 0;

    for (const entry of journal.entries)
    {
        if (isTimestampPrefix(entry.tag))
        {
            skipped++;
            continue;
        }

        const { prefix: oldPrefix, suffix } = parseTag(entry.tag);
        const newPrefix = String(entry.when);
        const newTag = suffix ? `${newPrefix}_${suffix}` : newPrefix;

        // SQL file rename
        const oldSql = join(outDir, `${entry.tag}.sql`);
        const newSql = join(outDir, `${newTag}.sql`);
        if (existsSync(oldSql))
        {
            renames.push({ type: 'sql', from: oldSql, to: newSql });
        }

        // Snapshot file rename
        const oldSnapshot = join(outDir, 'meta', `${oldPrefix}_snapshot.json`);
        const newSnapshot = join(outDir, 'meta', `${newPrefix}_snapshot.json`);
        if (existsSync(oldSnapshot))
        {
            renames.push({ type: 'snapshot', from: oldSnapshot, to: newSnapshot });
        }

        tagUpdates.push({ idx: entry.idx, oldTag: entry.tag, newTag });
    }

    if (tagUpdates.length === 0)
    {
        console.log(chalk.green('✅ All migrations already use timestamp prefix — nothing to do.'));
        if (skipped > 0)
        {
            console.log(chalk.dim(`   (${skipped} entries already timestamp-prefixed)`));
        }
        return;
    }

    // 4. Print plan
    console.log(chalk.bold('\n📋 Reindex plan:\n'));

    for (const update of tagUpdates)
    {
        console.log(
            chalk.dim(`  [${update.idx}]`),
            chalk.red(update.oldTag),
            chalk.dim('→'),
            chalk.green(update.newTag)
        );
    }

    console.log(chalk.dim(`\n  ${renames.length} file(s) to rename, ${tagUpdates.length} journal tag(s) to update`));

    if (skipped > 0)
    {
        console.log(chalk.dim(`  ${skipped} entry/entries already timestamp-prefixed (skipped)`));
    }

    // 5. Dry-run check
    if (options.dryRun)
    {
        console.log(chalk.yellow('\n🔍 Dry run — no changes applied.'));
        return;
    }

    // 6. Backup journal
    const backupPath = journalPath + '.bak';
    copyFileSync(journalPath, backupPath);
    console.log(chalk.dim(`\n  Backed up journal → ${backupPath}`));

    // 7. Rename files
    for (const rename of renames)
    {
        renameSync(rename.from, rename.to);
    }

    // 8. Update journal tags
    for (const update of tagUpdates)
    {
        const entry = journal.entries.find(e => e.idx === update.idx);
        if (entry)
        {
            entry.tag = update.newTag;
        }
    }

    writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n');

    // 9. Summary
    console.log(chalk.green(`\n✅ Reindex complete — ${tagUpdates.length} migration(s) converted to timestamp prefix.`));
}
