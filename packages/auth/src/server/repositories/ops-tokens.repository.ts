/**
 * Ops Tokens Repository
 *
 * Data access for the ops-token credential store. Extends BaseRepository for
 * transaction context and read/write splitting like every other auth
 * repository.
 */

import { and, desc, eq, isNull } from 'drizzle-orm';
import { BaseRepository } from '@spfn/core/db';
import { opsTokens, type NewOpsToken, type OpsToken } from '../entities/ops-tokens';

export class OpsTokensRepository extends BaseRepository
{
    /** Lookup by the secret's hash — the verification path. Read replica. */
    async findByTokenHash(tokenHash: string): Promise<OpsToken | null>
    {
        const result = await this.readDb
            .select()
            .from(opsTokens)
            .where(eq(opsTokens.tokenHash, tokenHash))
            .limit(1);

        return result[0] ?? null;
    }

    async create(data: NewOpsToken): Promise<OpsToken>
    {
        const result = await this.db
            .insert(opsTokens)
            .values(data)
            .returning();

        return result[0]!;
    }

    async list(): Promise<OpsToken[]>
    {
        return await this.readDb
            .select()
            .from(opsTokens)
            .orderBy(desc(opsTokens.createdAt));
    }

    /**
     * Revoke an active token. Returns null when the id does not exist or the
     * token is already revoked — the first revocation's timestamp is never
     * overwritten.
     */
    async revokeById(id: number): Promise<OpsToken | null>
    {
        const result = await this.db
            .update(opsTokens)
            .set({ revokedAt: new Date() })
            .where(and(eq(opsTokens.id, id), isNull(opsTokens.revokedAt)))
            .returning();

        return result[0] ?? null;
    }

    /** Fire-and-forget from the verification path. */
    async updateLastUsedById(id: number): Promise<void>
    {
        await this.db
            .update(opsTokens)
            .set({ lastUsedAt: new Date() })
            .where(eq(opsTokens.id, id));
    }
}

export const opsTokensRepository = new OpsTokensRepository();
