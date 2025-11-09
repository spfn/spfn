/**
 * Session helpers for Next.js
 *
 * Server-side only (uses next/headers)
 */

'use server';

import { cookies } from 'next/headers.js';
import { sealSession, unsealSession, type SessionData } from '@/lib/session';

export type { SessionData };

/**
 * Save session to HttpOnly cookie
 */
export async function saveSession(
    data: SessionData,
    maxAge: number = 60 * 60 * 24 * 7  // 7 days
): Promise<void> {
    const token = await sealSession(data, maxAge);
    const cookieStore = await cookies();

    cookieStore.set('session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge
    });
}

/**
 * Get session from HttpOnly cookie
 */
export async function getSession(): Promise<SessionData | null> {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');

    if (!sessionCookie) {
        return null;
    }

    return unsealSession(sessionCookie.value);
}

/**
 * Clear session cookie
 */
export async function clearSession(): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.delete('session');
}
