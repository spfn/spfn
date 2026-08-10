/**
 * @spfn/auth - Stored email normalization
 *
 * Brings existing rows into the canonical form the repository now writes and
 * reads. Without it, normalizing the code alone would lock out every account
 * whose address was stored with any capitalization: the lookup folds the typed
 * address to lower case, the stored one stays mixed, and they stop matching.
 *
 * Runs once at startup and records that it ran, so a healthy install pays one
 * small metadata read per boot rather than a scan of the users table.
 */

import { authLogger } from '../logger';
import { authMetadataRepository, usersRepository } from '../repositories';
import { normalizeEmail } from '../helpers/email';

/**
 * Metadata key marking the backfill complete.
 *
 * Only written when nothing was left unresolved — an install with conflicts
 * keeps reporting them on every boot, because they are the operator's to settle
 * and a silent one-time warning would scroll away unread.
 */
const BACKFILL_KEY = 'auth:email_normalization';

export interface EmailNormalizationResult
{
    /** Rows rewritten to canonical form. */
    normalized: number;
    /** User id groups that share an address once folded, left untouched. */
    conflicts: number[][];
}

/**
 * Group the rows that are not canonical by what they would become.
 */
function groupByCanonicalForm(rows: { id: number; email: string }[]): Map<string, number[]>
{
    const groups = new Map<string, number[]>();

    for (const row of rows)
    {
        const canonical = normalizeEmail(row.email);
        groups.set(canonical, [...(groups.get(canonical) ?? []), row.id]);
    }

    return groups;
}

/**
 * Rewrite stored addresses to canonical form, skipping anything that would
 * collide.
 *
 * A collision means two accounts differ only by capitalization. Which of them is
 * the real one, and what happens to the other's data, is not a question this can
 * answer — so both are left exactly as they are and their ids are reported. The
 * alternative, merging or deleting one, destroys an account on a guess.
 *
 * @returns what was rewritten and what was left for an operator
 */
export async function normalizeStoredEmails(): Promise<EmailNormalizationResult>
{
    if (await authMetadataRepository.get(BACKFILL_KEY))
    {
        return { normalized: 0, conflicts: [] };
    }

    const pending = await usersRepository.findNonCanonicalEmails();

    if (pending.length === 0)
    {
        await authMetadataRepository.set(BACKFILL_KEY, 'done');

        return { normalized: 0, conflicts: [] };
    }

    const groups = groupByCanonicalForm(pending);
    const canonicalForms = [...groups.keys()];
    const alreadyTaken = new Set(await usersRepository.findExistingEmails(canonicalForms));

    const conflicts: number[][] = [];
    let normalized = 0;

    for (const [canonical, ids] of groups)
    {
        // Two rows folding onto each other, or onto a row that already holds the
        // canonical form.
        if (ids.length > 1 || alreadyTaken.has(canonical))
        {
            conflicts.push(ids);
            continue;
        }

        await usersRepository.updateById(ids[0], { email: canonical });
        normalized++;
    }

    if (normalized > 0)
    {
        authLogger.service.info(`✉️  Normalized ${normalized} stored email address(es)`);
    }

    if (conflicts.length > 0)
    {
        // Addresses are personal data, so the report names user ids instead —
        // enough to find the rows, without copying mailboxes into the log.
        authLogger.service.error(
            `${conflicts.length} email group(s) differ only by capitalization and cannot be normalized `
            + 'automatically. The accounts are untouched and the ones stored in mixed case cannot sign in '
            + 'until this is resolved.',
            { conflictingUserIds: conflicts },
        );

        return { normalized, conflicts };
    }

    await authMetadataRepository.set(BACKFILL_KEY, 'done');

    return { normalized, conflicts };
}
