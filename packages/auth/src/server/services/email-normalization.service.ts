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
 *
 * The work itself stays in the database — one query to find the addresses two
 * rows would share, one statement to fold the rest. Nothing proportional to the
 * table is carried through the application, which is what keeps a legacy
 * install's first boot from turning into a row-at-a-time migration.
 */

import { authLogger } from '../logger';
import { authMetadataRepository, usersRepository } from '../repositories';

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
 * Rewrite stored addresses to canonical form, skipping anything that would
 * collide.
 *
 * A collision means two accounts differ only by capitalization. Which of them is
 * the real one, and what happens to the other's data, is not a question this can
 * answer — so every row in the group is left exactly as it is and all of their
 * ids are reported. The alternative, merging or deleting one, destroys an
 * account on a guess.
 *
 * @returns what was rewritten and what was left for an operator
 */
export async function normalizeStoredEmails(): Promise<EmailNormalizationResult>
{
    if (await authMetadataRepository.get(BACKFILL_KEY))
    {
        return { normalized: 0, conflicts: [] };
    }

    // Found before anything is rewritten, so a group is judged against the table
    // as it stands rather than against rows this run has already moved.
    const conflicts = await usersRepository.findEmailConflictGroups();
    const normalized = await usersRepository.normalizeEmailsExcept(conflicts.flat());

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
