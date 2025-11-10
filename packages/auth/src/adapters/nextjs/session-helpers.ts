/**
 * Session helpers for Next.js
 *
 * Server-side only (uses next/headers)
 */

import { cookies } from 'next/headers.js';
import { sealSession, unsealSession, type SessionData } from '@/lib/session';
import { COOKIE_NAMES } from '@/lib/config';
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
 * Save session to HttpOnly cookie
 */
export async function saveSession(
    data: SessionData,
    maxAge: number = 60 * 60 * 24 * 7  // 7 days
): Promise<void>
{
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
