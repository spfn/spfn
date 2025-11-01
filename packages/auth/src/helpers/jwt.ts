/**
 * @spfn/auth - JWT Helpers
 *
 * JWT token generation and verification
 */

import jwt from 'jsonwebtoken';
import type { SessionPayload } from '../types/api.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface TokenPayload extends SessionPayload
{
    exp?: number;
    iat?: number;
}

/**
 * Generate a JWT token
 */
export function generateToken(payload: SessionPayload): string
{
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
    });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): TokenPayload
{
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

/**
 * Decode a JWT token without verification (for debugging)
 */
export function decodeToken(token: string): TokenPayload | null
{
    return jwt.decode(token) as TokenPayload | null;
}