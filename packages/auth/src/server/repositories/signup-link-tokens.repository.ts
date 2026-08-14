/**
 * Signup Link Tokens Repository
 *
 * Data access for the verified-email signup flow. Extends BaseRepository for
 * transaction-context detection and read/write splitting.
 *
 * The two claim methods (`claimLink`, `claimSetupSession`) update conditionally
 * and return the row only if THIS call was the one that moved it. Two concurrent
 * confirms — or two concurrent password submits — therefore produce one winner
 * and one refusal, rather than both proceeding on a row they each read as
 * unclaimed. Read-then-write would lose that race.
 */

import { signupLinkTokens } from '../entities/signup-link-tokens';
import type { NewSignupLinkToken, SignupLinkToken } from '../entities/signup-link-tokens';
import { BaseRepository } from '@spfn/core/db';
import { eq, and, isNull } from 'drizzle-orm';

export class SignupLinkTokensRepository extends BaseRepository
{
    /**
     * Create a signup link row.
     * Write primary.
     */
    async create(data: NewSignupLinkToken): Promise<SignupLinkToken>
    {
        const result = await this.db
            .insert(signupLinkTokens)
            .values(data)
            .returning();

        return result[0];
    }

    /**
     * Find a row by the hash of an emailed token, in any state.
     *
     * Deliberately unfiltered: the caller decides why a link is refused, and a
     * row filtered out here would be indistinguishable from an unknown token in
     * the logs.
     *
     * Read replica.
     */
    async findByTokenHash(tokenHash: string): Promise<SignupLinkToken | null>
    {
        const result = await this.readDb
            .select()
            .from(signupLinkTokens)
            .where(eq(signupLinkTokens.tokenHash, tokenHash))
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * Find a row by the hash of a setup session secret, in any state.
     * Read replica.
     */
    async findBySetupSecretHash(setupSecretHash: string): Promise<SignupLinkToken | null>
    {
        const result = await this.readDb
            .select()
            .from(signupLinkTokens)
            .where(eq(signupLinkTokens.setupSecretHash, setupSecretHash))
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * Consume a link and open a setup session on it, but only if it is still
     * unconsumed and not superseded.
     *
     * @returns the updated row, or null if another request claimed it first
     */
    async claimLink(
        id: number,
        setupSecretHash: string,
        setupExpiresAt: Date,
    ): Promise<SignupLinkToken | null>
    {
        const result = await this.db
            .update(signupLinkTokens)
            .set({
                consumedAt: new Date(),
                setupSecretHash,
                setupExpiresAt,
            })
            .where(
                and(
                    eq(signupLinkTokens.id, id),
                    isNull(signupLinkTokens.consumedAt),
                    isNull(signupLinkTokens.supersededAt),
                ),
            )
            .returning();

        return result[0] ?? null;
    }

    /**
     * Mark a setup session as completed, but only if it has not completed
     * already.
     *
     * @returns the updated row, or null if another request completed it first
     */
    async claimSetupSession(id: number): Promise<SignupLinkToken | null>
    {
        const result = await this.db
            .update(signupLinkTokens)
            .set({ completedAt: new Date() })
            .where(
                and(
                    eq(signupLinkTokens.id, id),
                    isNull(signupLinkTokens.completedAt),
                    isNull(signupLinkTokens.supersededAt),
                ),
            )
            .returning();

        return result[0] ?? null;
    }

    /**
     * Supersede every live link for an address, so requesting a new one
     * invalidates the previous one and any setup session opened from it.
     *
     * Write primary.
     *
     * @returns number of rows superseded
     */
    async supersedeLiveForEmail(email: string): Promise<number>
    {
        const result = await this.db
            .update(signupLinkTokens)
            .set({ supersededAt: new Date() })
            .where(
                and(
                    eq(signupLinkTokens.email, email),
                    isNull(signupLinkTokens.supersededAt),
                    isNull(signupLinkTokens.completedAt),
                ),
            )
            .returning();

        return result.length;
    }

    /**
     * Delete every signup link row for an address (account destruction).
     *
     * Rows key on the email text and carry no user FK, so destruction has to
     * clean them up by address the way verification codes are cleaned up.
     *
     * Write primary.
     */
    async deleteByEmail(email: string): Promise<number>
    {
        const result = await this.db
            .delete(signupLinkTokens)
            .where(eq(signupLinkTokens.email, email))
            .returning();

        return result.length;
    }
}

// Default instance export
export const signupLinkTokensRepository = new SignupLinkTokensRepository();
