/**
 * Session helpers for Next.js
 *
 * Server-side only (uses next/headers)
 */

import { cookies } from 'next/headers.js';
import { sealSession, unsealSession, COOKIE_NAMES, getSessionTtl, parseDuration, type SessionData } from '@spfn/auth/server';
import { logger } from '@spfn/core/logger';

export type { SessionData };

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
    options?: SaveSessionOptions
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
        sameSite: 'strict',
        path: '/',
        maxAge
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
        const session = await unsealSession(sessionCookie.value);
        // Return only public information
        return {
            userId: session.userId,
        };
    }
    catch (error)
    {
        // Session expired or invalid - log in dev mode
        // Note: Cannot delete cookies in Server Components (read-only)
        // Invalid cookies will be cleaned up on next login/logout via Route Handler or Server Action
        logger.debug('Session validation failed', {
            error: error instanceof Error ? error.message : String(error)
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
