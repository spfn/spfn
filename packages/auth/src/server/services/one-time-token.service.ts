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

    // TTL is internal to the manager; estimate expiresAt from current time + default TTL
    // The actual expiration is managed by the token store
    const expiresAt = new Date(Date.now() + 30000).toISOString();

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
