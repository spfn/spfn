/**
 * @spfn/auth - Verification Service
 *
 * Handles OTP code generation, validation, and delivery
 */

import {
    generateVerificationCode,
    storeVerificationCode,
    validateVerificationCode,
    markCodeAsUsed,
    createVerificationToken,
    sendVerificationEmail,
    sendVerificationSMS
} from '@/server/helpers/verification';
import { InvalidVerificationCodeError } from '@/server/errors';

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
export async function verifyCodeService(
    params: VerifyCodeParams
): Promise<VerifyCodeResult>
{
    const { target, targetType, code, purpose } = params;

    // Validate the verification code
    const validation = await validateVerificationCode(target, targetType, code, purpose);

    if (!validation.valid)
    {
        throw new InvalidVerificationCodeError(validation.error || 'Invalid verification code');
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
