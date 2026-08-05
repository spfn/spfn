/**
 * One-Time Token Service
 *
 * Issues and verifies one-time tokens for direct API access.
 */

import { getOneTimeTokenManager } from '../lib/one-time-token';

export interface IssueOneTimeTokenResult
{
    token: string;
    expiresAt: string;
}

/**
 * Issue a one-time token for the authenticated user
 *
 * @param userId - Authenticated user's ID
 * @returns Token string and ISO expiration timestamp
 */
export async function issueOneTimeTokenService(userId: string): Promise<IssueOneTimeTokenResult>
{
    const manager = getOneTimeTokenManager();
    const token = await manager.issue(userId);

    // Read the TTL off the manager rather than assuming the default: an app that
    // configured a different one would otherwise be told the wrong expiry.
    const expiresAt = new Date(Date.now() + manager.ttlMs).toISOString();

    return { token, expiresAt };
}

/**
 * Verify and consume a one-time token
 *
 * @param token - The one-time token to verify
 * @returns userId if valid, null if invalid/expired/consumed
 */
export async function verifyOneTimeTokenService(token: string): Promise<string | null>
{
    const manager = getOneTimeTokenManager();

    return await manager.verify(token);
}
