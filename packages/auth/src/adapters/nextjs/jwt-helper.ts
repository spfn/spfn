/**
 * JWT Helper for Next.js Server-Side
 *
 * Shared helper for generating JWT from session cookie
 */

'use server';

import { cookies } from 'next/headers';
import { unsealSession } from '@/lib/session';
import { generateClientToken } from '@/lib/crypto';

/**
 * Generate JWT token from HttpOnly session cookie
 *
 * @returns JWT token string, or null if no valid session
 */
export async function generateJWTFromSession(): Promise<string | null>
{
    // Get session from HttpOnly cookie
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');

    if (!sessionCookie)
    {
        return null;
    }

    // Unseal session to get private key
    const session = await unsealSession(sessionCookie.value).catch(() => null);

    if (!session)
    {
        return null;
    }

    // Generate JWT token
    const token = generateClientToken(
        { userId: session.userId, keyId: session.keyId },
        session.privateKey,
        session.algorithm,
        { expiresIn: '15m' }
    );

    return token;
}