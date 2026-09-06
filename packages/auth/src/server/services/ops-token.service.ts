/**
 * Ops Token Service
 *
 * Issuance and verification for the CLI-first ops surface. The secret is
 * `spfn_ops_<64 hex>`; only its SHA-256 hash is stored, so issuance is the
 * one moment the secret exists in the clear.
 *
 * Verification answers with the same null for an unknown, revoked, or
 * expired token — the refusal reveals nothing about whether a presented
 * secret ever existed (the non-disclosure rule the client-proof surface
 * keeps).
 */

import { createHash, randomBytes } from 'node:crypto';
import { opsTokensRepository } from '../repositories/ops-tokens.repository';
import type { OpsToken } from '../entities/ops-tokens';
import { authLogger } from '../logger';

/**
 * The shape every ops-token secret carries.
 *
 * Exported because an application that admits both an ops token and a user
 * session on one route has to tell the two apart before either is verified,
 * and a literal copied into application code drifts silently when this
 * package changes the shape.
 */
export const OPS_TOKEN_PREFIX = 'spfn_ops_';

/**
 * Whether a presented bearer credential has the ops-token shape.
 *
 * Shape only — a token of this shape may still be unknown, revoked, or
 * expired; `verifyOpsTokenService` decides that. Callers read a raw header,
 * so a missing or non-string argument answers false rather than throwing.
 */
export function isOpsToken(bearer: string): boolean
{
    return typeof bearer === 'string' && bearer.startsWith(OPS_TOKEN_PREFIX);
}

/** What a verified token authorizes — the principal ops middleware exposes. */
export interface VerifiedOpsToken
{
    tokenId: number;
    name: string;
    scopes: string[];
}

export interface IssuedOpsToken
{
    /** The secret, shown exactly once. Never stored, never logged. */
    token: string;
    record: OpsToken;
}

function hashOpsToken(token: string): string
{
    return createHash('sha256').update(token).digest('hex');
}

/**
 * Issue a new ops token.
 *
 * @param name - Operator-facing label
 * @param scopes - Permission strings the token grants ('*' grants all)
 * @param expiresAt - null for a non-expiring token
 */
export async function issueOpsTokenService(
    name: string,
    scopes: string[],
    expiresAt: Date | null,
): Promise<IssuedOpsToken>
{
    if (scopes.length === 0)
    {
        throw new Error('An ops token needs at least one scope (\'*\' grants all).');
    }

    const token = OPS_TOKEN_PREFIX + randomBytes(32).toString('hex');
    const record = await opsTokensRepository.create({
        name,
        tokenHash: hashOpsToken(token),
        scopes,
        expiresAt,
    });

    return { token, record };
}

/**
 * Verify a presented token. Null for unknown, revoked, and expired alike.
 */
export async function verifyOpsTokenService(token: string): Promise<VerifiedOpsToken | null>
{
    if (!isOpsToken(token))
    {
        return null;
    }

    const record = await opsTokensRepository.findByTokenHash(hashOpsToken(token));
    if (!record)
    {
        return null;
    }
    if (record.revokedAt !== null)
    {
        return null;
    }
    if (record.expiresAt !== null && new Date() > record.expiresAt)
    {
        return null;
    }

    opsTokensRepository.updateLastUsedById(record.id)
        .catch((err: unknown) => authLogger.service.error('Failed to update ops token lastUsedAt', err));

    return {
        tokenId: record.id,
        name: record.name,
        scopes: record.scopes,
    };
}

export async function revokeOpsTokenService(id: number): Promise<OpsToken | null>
{
    return await opsTokensRepository.revokeById(id);
}

export async function listOpsTokensService(): Promise<OpsToken[]>
{
    return await opsTokensRepository.list();
}
