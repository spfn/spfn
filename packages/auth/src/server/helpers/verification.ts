/**
 * @spfn/auth - Verification Code Helpers
 *
 * Helper functions for email/phone verification codes
 */

import jwt from 'jsonwebtoken';
import { getDatabase, create } from '@spfn/core/db';
import { verificationCodes } from '@/server/entities/verification-codes';
import { eq, and } from 'drizzle-orm';

/**
 * JWT secret for verification tokens
 * Must be at least 32 characters long
 */
function getVerificationTokenSecret(): string
{
    const secret =
        process.env.SPFN_AUTH_VERIFICATION_TOKEN_SECRET ||  // New prefixed version (recommended)
        process.env.VERIFICATION_TOKEN_SECRET ||            // Legacy fallback
        process.env.SPFN_AUTH_JWT_SECRET ||                 // New JWT secret fallback
        process.env.JWT_SECRET;                             // Legacy JWT secret fallback

    if (!secret || secret.length < 32)
    {
        throw new Error('SPFN_AUTH_VERIFICATION_TOKEN_SECRET must be at least 32 characters long');
    }

    return secret;
}

/**
 * Verification token expiry (15 minutes)
 */
const VERIFICATION_TOKEN_EXPIRY = '15m';

/**
 * Verification code expiry (5 minutes)
 */
const VERIFICATION_CODE_EXPIRY_MINUTES = 5;

/**
 * Maximum verification attempts before code expires
 */
const MAX_VERIFICATION_ATTEMPTS = 5;

/**
 * Verification token payload
 */
export interface VerificationTokenPayload
{
    target: string;
    targetType: 'email' | 'phone';
    purpose: 'registration' | 'login' | 'password_reset';
    codeId: number;
}

/**
 * Generate a random 6-digit verification code
 *
 * @returns 6-digit code as string
 */
export function generateVerificationCode(): string
{
    // Generate random 6-digit number (000000 - 999999)
    const code = Math.floor(Math.random() * 1000000)
        .toString()
        .padStart(6, '0');

    return code;
}

/**
 * Store verification code in database
 *
 * @param target - Email or phone number
 * @param targetType - Type of target (email or phone)
 * @param code - 6-digit verification code
 * @param purpose - Purpose of verification
 * @returns Created verification code record
 */
export async function storeVerificationCode(
    target: string,
    targetType: 'email' | 'phone',
    code: string,
    purpose: 'registration' | 'login' | 'password_reset'
)
{
    const db = getDatabase();
    if (!db)
    {
        throw new Error('Database not initialized');
    }

    // Calculate expiry time
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + VERIFICATION_CODE_EXPIRY_MINUTES);

    // Create verification code record
    const record = await create(verificationCodes, {
        target,
        targetType,
        code,
        purpose,
        expiresAt,
        attempts: '0',
    });

    return record;
}

/**
 * Validate verification code
 *
 * @param target - Email or phone number
 * @param targetType - Type of target
 * @param code - 6-digit code to validate
 * @param purpose - Purpose of verification
 * @returns Validation result with code ID if valid
 */
export async function validateVerificationCode(
    target: string,
    targetType: 'email' | 'phone',
    code: string,
    purpose: 'registration' | 'login' | 'password_reset'
): Promise<{ valid: boolean; codeId?: number; error?: string }>
{
    const db = getDatabase();
    if (!db)
    {
        throw new Error('Database not initialized');
    }

    // Find the verification code
    const records = await db
        .select()
        .from(verificationCodes)
        .where(
            and(
                eq(verificationCodes.target, target),
                eq(verificationCodes.targetType, targetType),
                eq(verificationCodes.code, code),
                eq(verificationCodes.purpose, purpose)
            )
        )
        .limit(1);

    if (records.length === 0)
    {
        return { valid: false, error: 'Invalid verification code' };
    }

    const record = records[0];

    // Check if code is already used
    if (record.usedAt)
    {
        return { valid: false, error: 'Verification code already used' };
    }

    // Check if code is expired
    if (new Date() > new Date(record.expiresAt))
    {
        return { valid: false, error: 'Verification code expired' };
    }

    // Check attempt count
    const attempts = parseInt(record.attempts, 10);
    if (attempts >= MAX_VERIFICATION_ATTEMPTS)
    {
        return { valid: false, error: 'Too many attempts, please request a new code' };
    }

    // Increment attempt count
    await db
        .update(verificationCodes)
        .set({ attempts: (attempts + 1).toString() })
        .where(eq(verificationCodes.id, record.id));

    return { valid: true, codeId: record.id };
}

/**
 * Mark verification code as used
 *
 * @param codeId - Verification code ID
 */
export async function markCodeAsUsed(codeId: number): Promise<void>
{
    const db = getDatabase();
    if (!db)
    {
        throw new Error('Database not initialized');
    }

    await db
        .update(verificationCodes)
        .set({ usedAt: new Date() })
        .where(eq(verificationCodes.id, codeId));
}

/**
 * Create verification token (JWT)
 *
 * @param payload - Token payload
 * @returns Signed JWT token
 */
export function createVerificationToken(payload: VerificationTokenPayload): string
{
    const secret = getVerificationTokenSecret();
    return jwt.sign(payload, secret, {
        expiresIn: VERIFICATION_TOKEN_EXPIRY,
        issuer: 'spfn-auth',
        audience: 'spfn-client',
    });
}

/**
 * Validate verification token (JWT)
 *
 * @param token - JWT token to validate
 * @returns Decoded payload if valid, null otherwise
 */
export function validateVerificationToken(token: string): VerificationTokenPayload | null
{
    try
    {
        const secret = getVerificationTokenSecret();
        const decoded = jwt.verify(token, secret, {
            issuer: 'spfn-auth',
            audience: 'spfn-client',
        });

        // Validate that decoded has required properties
        if (
            typeof decoded === 'object' &&
            decoded !== null &&
            'target' in decoded &&
            'targetType' in decoded &&
            'purpose' in decoded &&
            'codeId' in decoded
        )
        {
            return decoded as VerificationTokenPayload;
        }

        return null;
    }
    catch (error)
    {
        console.error('[validateVerificationToken] Error:', error);
        return null;
    }
}

/**
 * Send verification code via email
 *
 * @param email - Email address
 * @param code - 6-digit verification code
 * @param purpose - Purpose of verification
 */
export async function sendVerificationEmail(
    email: string,
    code: string,
    purpose: string
): Promise<void>
{
    // TODO: Implement email sending with your email service
    // For now, just log to console (development only)
    console.log(`[VERIFICATION EMAIL] To: ${email}, Code: ${code}, Purpose: ${purpose}`);

    // Example implementation with nodemailer:
    // const transporter = nodemailer.createTransport({...});
    // await transporter.sendMail({
    //     from: 'noreply@yourapp.com',
    //     to: email,
    //     subject: 'Your Verification Code',
    //     text: `Your verification code is: ${code}`,
    //     html: `<p>Your verification code is: <strong>${code}</strong></p>`,
    // });
}

/**
 * Send verification code via SMS
 *
 * @param phone - Phone number in E.164 format
 * @param code - 6-digit verification code
 * @param purpose - Purpose of verification
 */
export async function sendVerificationSMS(
    phone: string,
    code: string,
    purpose: string
): Promise<void>
{
    // TODO: Implement SMS sending with your SMS service (Twilio, AWS SNS, etc.)
    // For now, just log to console (development only)
    console.log(`[VERIFICATION SMS] To: ${phone}, Code: ${code}, Purpose: ${purpose}`);

    // Example implementation with Twilio:
    // const client = twilio(accountSid, authToken);
    // await client.messages.create({
    //     body: `Your verification code is: ${code}`,
    //     from: '+1234567890',
    //     to: phone,
    // });
}