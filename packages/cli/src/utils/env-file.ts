/**
 * Shared helpers for reading, editing, and gitignoring `.env*` files.
 *
 * Extracted from `commands/env.ts` and `commands/init/steps/config-files.ts` so the
 * same parsing/merge/ignore rules back both `spfn init` and `spfn secret`.
 */

import { existsSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { parse } from 'dotenv';

/**
 * Best-effort tighten a secret-bearing env file to owner read/write only (0600), so
 * `.env.server` is never left world-readable. A no-op on filesystems without POSIX
 * modes (Windows, some mounts).
 */
export function restrictEnvFilePerms(filePath: string): void
{
    try
    {
        chmodSync(filePath, 0o600);
    }
    catch
    {
        // No POSIX permissions here — leave the file as the OS created it.
    }
}

/**
 * Extract the variable name from a `KEY=value` line, or null for comments/blanks.
 *
 * Tolerates dotenv's `export ` prefix and surrounding whitespace, so a key already
 * present as `export DATABASE_URL=` is recognised.
 */
export function envKeyOf(line: string): string | null
{
    const match = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=/);

    return match ? match[1] : null;
}

/**
 * Keys declared in the file, counting commented `# KEY=` lines too, so a
 * deliberately-disabled key is treated as present.
 */
export function collectDeclaredKeys(content: string): Set<string>
{
    const keys = new Set<string>();

    for (const line of content.split('\n'))
    {
        const key = envKeyOf(line.replace(/^\s*#\s*/, ''));
        if (key !== null)
        {
            keys.add(key);
        }
    }

    return keys;
}

/**
 * Parse an env file into a key→value record, or an empty record if absent.
 */
export function parseEnvFile(filePath: string): Record<string, string>
{
    if (!existsSync(filePath))
    {
        return {};
    }

    return parse(readFileSync(filePath, 'utf-8'));
}

/**
 * Insert or replace a single `KEY=value` line in an env file, preserving every
 * other line. Returns whether the key was added or an existing line replaced.
 */
export function upsertEnvVar(filePath: string, key: string, value: string): 'added' | 'updated'
{
    const existing = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
    const line = `${key}=${value}`;

    let replaced = false;
    const next = existing.split('\n').map((current) =>
    {
        if (!replaced && envKeyOf(current) === key)
        {
            replaced = true;

            return line;
        }

        return current;
    });

    if (replaced)
    {
        writeFileSync(filePath, next.join('\n'));

        return 'updated';
    }

    const base = existing.length > 0 && !existing.endsWith('\n') ? existing + '\n' : existing;
    writeFileSync(filePath, base + line + '\n');

    return 'added';
}

/**
 * True when some ignore line already covers `target`. Matches an exact rule
 * (ignoring leading/trailing slashes) or a trailing-`*` glob like `.env*`, but not
 * a comment or a longer name. Follows gitignore's last-match-wins rule: a later
 * `!target` negation un-covers, and a later positive rule can re-cover again.
 */
export function gitignoreCovers(lines: string[], target: string): boolean
{
    const normalized = stripSlashes(target);
    let covered = false;

    for (const raw of lines)
    {
        const line = raw.trim();

        if (line === '' || line.startsWith('#'))
        {
            continue;
        }

        const negation = line.startsWith('!');
        const rule = stripSlashes(negation ? line.slice(1) : line);

        if (rule === normalized || (rule.endsWith('*') && normalized.startsWith(rule.slice(0, -1))))
        {
            covered = !negation;
        }
    }

    return covered;
}

export function stripSlashes(value: string): string
{
    return value.replace(/^\//, '').replace(/\/$/, '');
}

/**
 * Append any ignore rules not already covered by the project's .gitignore.
 * Returns the patterns that were added (empty when nothing changed).
 */
export function ensureGitignored(cwd: string, entries: { pattern: string; comment: string }[]): string[]
{
    const gitignorePath = join(cwd, '.gitignore');
    const content = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
    const lines = content.split('\n');

    const added: string[] = [];
    let appended = '';

    for (const { pattern, comment } of entries)
    {
        if (!gitignoreCovers(lines, pattern))
        {
            appended += `\n# ${comment}\n${pattern}\n`;
            added.push(pattern);
        }
    }

    if (appended.length > 0)
    {
        writeFileSync(gitignorePath, content + appended);
    }

    return added;
}
