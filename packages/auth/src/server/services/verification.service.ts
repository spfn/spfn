/**
 * @spfn/auth - Verification Service
 *
 * Handles OTP code generation, validation, and delivery
 */

import { verificationCodesRepository } from '@/server/repositories';
import { InvalidVerificationCodeError } from '@/errors';
import jwt from 'jsonwebtoken';
import { getVerificationTokenSecret } from '@/config';

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
async function storeVerificationCode(
    target: string,
    targetType: 'email' | 'phone',
    code: string,
    purpose: 'registration' | 'login' | 'password_reset'
)
{
    // Calculate expiry time
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + VERIFICATION_CODE_EXPIRY_MINUTES);

    // Invalidate previous codes for same target/purpose
    await verificationCodesRepository.invalidatePreviousCodes(target, purpose);

    // Create verification code record
    return await verificationCodesRepository.create({
        target,
        targetType,
        code,
        purpose,
        expiresAt,
        attempts: 0,
    });
}

/**
 * Validate verification code
 *
 * @param target - Email or phone number
 * @param code - 6-digit code to validate
 * @param purpose - Purpose of verification
 * @returns Validation result with code ID if valid
 */
async function validateVerificationCode(
    target: string,
    code: string,
    purpose: 'registration' | 'login' | 'password_reset'
): Promise<{ valid: boolean; codeId?: number; error?: string }>
{
    // Find the verification code
    const record = await verificationCodesRepository.findValidByTargetAndPurpose(target, purpose);

    if (!record)
    {
        return { valid: false, error: 'Invalid verification code' };
    }

    // Check if code matches
    if (record.code !== code)
    {
        // Increment attempt count
        await verificationCodesRepository.incrementAttempts(record.id);
        return { valid: false, error: 'Invalid verification code' };
    }

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
    if (record.attempts >= MAX_VERIFICATION_ATTEMPTS)
    {
        return { valid: false, error: 'Too many attempts, please request a new code' };
    }

    return { valid: true, codeId: record.id };
}

/**
 * Mark verification code as used
 *
 * @param codeId - Verification code ID
 */
async function markCodeAsUsed(codeId: number): Promise<void>
{
    await verificationCodesRepository.markAsUsed(codeId);
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
async function sendVerificationEmail(
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
async function sendVerificationSMS(
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

export interface SendVerificationCodeParams
{
    target: string;
    targetType: 'email' | 'phone';
    purpose: 'registration' | 'login' | 'password_reset';
}

export interface SendVerificationCodeResult
{
    success: boolean;
    expiresAt: string;
}

export interface VerifyCodeParams
{
    target: string;
    targetType: 'email' | 'phone';
    code: string;
    purpose: 'registration' | 'login' | 'password_reset';
}

export interface VerifyCodeResult
{
    valid: boolean;
    verificationToken: string;
}

/**
 * Send verification code via email or SMS
 */
export async function sendVerificationCodeService(
    params: SendVerificationCodeParams
): Promise<SendVerificationCodeResult>
{
    const { target, targetType, purpose } = params;

    // Generate 6-digit verification code
    const code = generateVerificationCode();

    // Store code in database
    const codeRecord = await storeVerificationCode(target, targetType, code, purpose);

    // Send code via email or SMS
    if (targetType === 'email')
    {
        await sendVerificationEmail(target, code, purpose);
    }
    else
    {
        await sendVerificationSMS(target, code, purpose);
    }

    return {
        success: true,
        expiresAt: codeRecord.expiresAt.toISOString(),
    };
}

/**
 * Verify OTP code and return verification token
 */
export async function verifyCodeService(params: VerifyCodeParams)
{
    const { target, targetType, code, purpose } = params;

    // Validate the verification code
    const validation = await validateVerificationCode(target, code, purpose);

    if (!validation.valid)
    {
        throw new InvalidVerificationCodeError({ message: validation.error || 'Invalid verification code' });
    }

    // Mark code as used
    await markCodeAsUsed(validation.codeId!);

    // Create verification token (15 min validity)
    const verificationToken = createVerificationToken({
        target,
        targetType,
        purpose,
        codeId: validation.codeId!,
    });

    return {
        valid: true,
        verificationToken,
    };
}
