/**
 * Session helpers for Next.js
 *
 * Server-side only (uses next/headers)
 */

import * as jose from 'jose';
import { cookies } from 'next/headers.js';
import { sealSession, unsealSession, type SessionData } from '../server/lib/session';
import { COOKIE_NAMES, getSessionTtl, parseDuration } from '../server/lib/config';
import { type KeyAlgorithmType } from '../server/types';
import { env } from '@spfn/auth/config';
import { logger } from '@spfn/core/logger';

export type { SessionData };

/**
 * Pending OAuth session data (before user ID is known)
 */
export interface PendingSessionData
{
    privateKey: string;
    keyId: string;
    algorithm: KeyAlgorithmType;
}

/**
 * Public session information (excludes sensitive data)
 */
export interface PublicSession
{
    /** User ID */
    userId: string;
}

/**
 * Options for saveSession
 */
export interface SaveSessionOptions
{
    /**
     * Session TTL (time to live)
     *
     * Supports:
     * - Number: seconds (e.g., 2592000)
     * - String: duration format ('30d', '12h', '45m', '3600s')
     *
     * If not provided, uses global configuration:
     * 1. Global config (configureAuth)
     * 2. Environment variable (SPFN_AUTH_SESSION_TTL)
     * 3. Default (7d)
     */
    maxAge?: number | string;

    /**
     * Remember me option
     *
     * When true, uses extended session duration (if configured)
     */
    remember?: boolean;
}

/**
 * Save session to HttpOnly cookie
 *
 * @param data - Session data to save
 * @param options - Session options (maxAge, remember)
 *
 * @example
 * ```typescript
 * // Use global configuration
 * await saveSession(sessionData);
 *
 * // Custom TTL with duration string
 * await saveSession(sessionData, { maxAge: '30d' });
 *
 * // Custom TTL in seconds
 * await saveSession(sessionData, { maxAge: 2592000 });
 *
 * // Remember me
 * await saveSession(sessionData, { remember: true });
 * ```
 */
export async function saveSession(
    data: SessionData,
    options?: SaveSessionOptions,
): Promise<void>
{
    // Calculate maxAge
    let maxAge: number;

    if (options?.maxAge !== undefined)
    {
        // Custom maxAge provided
        maxAge = typeof options.maxAge === 'number'
            ? options.maxAge
            : parseDuration(options.maxAge);
    }
    else
    {
        // Use getSessionTtl for consistent configuration
        maxAge = getSessionTtl();
    }

    const token = await sealSession(data, maxAge);
    const cookieStore = await cookies();

    cookieStore.set(COOKIE_NAMES.SESSION, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge,
    });
}

/**
 * Get session from HttpOnly cookie
 *
 * Returns public session info only (excludes privateKey, algorithm, keyId)
 */
export async function getSession(): Promise<PublicSession | null>
{
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(COOKIE_NAMES.SESSION);

    if (!sessionCookie)
    {
        return null;
    }

    try
    {
        // Never log the cookie value — it's the sealed session token.
        logger.debug('Validating session cookie', { present: true });
        const session = await unsealSession(sessionCookie.value);

        // Return only public information
        return {
            userId: session.userId,
        };
    }
    catch (error)
    {
        // Session expired or invalid
        // Note: Cannot delete cookies in Server Components (read-only)
        // Use validateSessionMiddleware() in Next.js middleware for automatic cleanup
        logger.debug('Session validation failed', {
            error: error instanceof Error ? error.message : String(error),
        });

        return null;
    }
}

/**
 * Clear session cookie
 */
export async function clearSession(): Promise<void>
{
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAMES.SESSION);
    cookieStore.delete(COOKIE_NAMES.SESSION_KEY_ID);
}

// ============================================================================
// Pending OAuth Session (for OAuth flow)
// ============================================================================

/**
 * Get encryption key for pending session
 */
async function getPendingSessionKey(): Promise<Uint8Array>
{
    const secret = env.SPFN_AUTH_SESSION_SECRET;
    const encoder = new TextEncoder();
    const data = encoder.encode(`oauth-pending:${secret}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    return new Uint8Array(hashBuffer);
}

/**
 * Seal pending session data (for OAuth flow)
 *
 * @param data - Pending session data (privateKey, keyId, algorithm)
 * @param ttl - Time to live in seconds (default: 10 minutes)
 */
export async function sealPendingSession(
    data: PendingSessionData,
    ttl: number = 600,
): Promise<string>
{
    const key = await getPendingSessionKey();

    return await new jose.EncryptJWT({ data })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .setIssuedAt()
        .setExpirationTime(`${ttl}s`)
        .setIssuer('spfn-auth')
        .setAudience('spfn-oauth')
        .encrypt(key);
}

/**
 * Unseal pending session data
 *
 * @param jwt - Encrypted pending session token
 */
export async function unsealPendingSession(jwt: string): Promise<PendingSessionData>
{
    const key = await getPendingSessionKey();

    const { payload } = await jose.jwtDecrypt(jwt, key, {
        issuer: 'spfn-auth',
        audience: 'spfn-oauth',
    });

    return payload.data as PendingSessionData;
}

/**
 * Get pending session from cookie
 */
export async function getPendingSession(): Promise<PendingSessionData | null>
{
    const cookieStore = await cookies();
    const pendingCookie = cookieStore.get(COOKIE_NAMES.OAUTH_PENDING);

    if (!pendingCookie)
    {
        return null;
    }

    try
    {
        return await unsealPendingSession(pendingCookie.value);
    }
    catch (error)
    {
        logger.debug('Pending session validation failed', {
            error: error instanceof Error ? error.message : String(error),
        });

        return null;
    }
}

/**
 * Clear pending session cookie
 */
export async function clearPendingSession(): Promise<void>
{
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAMES.OAUTH_PENDING);
}
