/**
 * @spfn/notification - Tracking Token
 *
 * HMAC-SHA256 based token generation and verification for tracking URLs.
 * Tokens are URL-safe and verifiable without DB lookup.
 *
 * Token format: base64url(payload).base64url(hmac)
 */

import { createHmac } from 'node:crypto';
import { getTrackingSecret } from '../config';

/**
 * Base64url encode a buffer
 */
function toBase64Url(buffer: Buffer): string
{
    return buffer.toString('base64url');
}

/**
 * Base64url decode to string
 */
function fromBase64Url(str: string): string
{
    return Buffer.from(str, 'base64url').toString('utf8');
}

/**
 * Sign a payload with HMAC-SHA256
 */
function sign(payload: string): string
{
    const secret = getTrackingSecret();
    if (!secret)
    {
        throw new Error('Tracking secret is not configured');
    }

    const payloadEncoded = toBase64Url(Buffer.from(payload, 'utf8'));
    const hmac = createHmac('sha256', secret).update(payload).digest();
    const hmacEncoded = toBase64Url(hmac);

    return `${payloadEncoded}.${hmacEncoded}`;
}

/**
 * Verify a token and return the payload
 */
function verify(token: string): { valid: boolean; payload?: string }
{
    const secret = getTrackingSecret();
    if (!secret)
    {
        return { valid: false };
    }

    const dotIndex = token.indexOf('.');
    if (dotIndex === -1)
    {
        return { valid: false };
    }

    const payloadEncoded = token.substring(0, dotIndex);
    const hmacEncoded = token.substring(dotIndex + 1);

    const payload = fromBase64Url(payloadEncoded);
    const expectedHmac = createHmac('sha256', secret).update(payload).digest();
    const expectedHmacEncoded = toBase64Url(expectedHmac);

    if (hmacEncoded !== expectedHmacEncoded)
    {
        return { valid: false };
    }

    return { valid: true, payload };
}

/**
 * Generate an open tracking token
 */
export function generateOpenToken(notificationId: number): string
{
    return sign(`o:${notificationId}`);
}

/**
 * Generate a click tracking token
 */
export function generateClickToken(notificationId: number, linkIndex: number): string
{
    return sign(`c:${notificationId}:${linkIndex}`);
}

/**
 * Verify an open tracking token
 */
export function verifyOpenToken(token: string): { valid: boolean; notificationId?: number }
{
    const result = verify(token);
    if (!result.valid || !result.payload)
    {
        return { valid: false };
    }

    const match = result.payload.match(/^o:(\d+)$/);
    if (!match)
    {
        return { valid: false };
    }

    return { valid: true, notificationId: Number(match[1]) };
}

/**
 * Verify a click tracking token
 */
export function verifyClickToken(
    token: string
): { valid: boolean; notificationId?: number; linkIndex?: number }
{
    const result = verify(token);
    if (!result.valid || !result.payload)
    {
        return { valid: false };
    }

    const match = result.payload.match(/^c:(\d+):(\d+)$/);
    if (!match)
    {
        return { valid: false };
    }

    return {
        valid: true,
        notificationId: Number(match[1]),
        linkIndex: Number(match[2]),
    };
}
