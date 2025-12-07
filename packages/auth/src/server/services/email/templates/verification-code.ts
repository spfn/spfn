/**
 * @spfn/auth - Verification Code Email Template
 *
 * HTML email template for verification codes (registration, login, password reset)
 */

export interface VerificationCodeTemplateParams
{
    /**
     * 6-digit verification code
     */
    code: string;

    /**
     * Purpose of verification
     */
    purpose: 'registration' | 'login' | 'password_reset' | string;

    /**
     * Code expiration time in minutes
     */
    expiresInMinutes?: number;

    /**
     * App/Brand name (optional)
     */
    appName?: string;
}

/**
 * Get subject line based on purpose
 */
export function getSubject(purpose: string): string
{
    switch (purpose)
    {
        case 'registration':
            return 'Verify your email address';
        case 'login':
            return 'Your login verification code';
        case 'password_reset':
            return 'Reset your password';
        default:
            return 'Your verification code';
    }
}

/**
 * Get purpose description text
 */
function getPurposeText(purpose: string): string
{
    switch (purpose)
    {
        case 'registration':
            return 'complete your registration';
        case 'login':
            return 'verify your identity';
        case 'password_reset':
            return 'reset your password';
        default:
            return 'verify your identity';
    }
}

/**
 * Generate plain text version
 */
export function generateText(params: VerificationCodeTemplateParams): string
{
    const { code, expiresInMinutes = 5 } = params;

    return `Your verification code is: ${code}

This code will expire in ${expiresInMinutes} minutes.

If you didn't request this code, please ignore this email.`;
}

/**
 * Generate HTML version
 */
export function generateHTML(params: VerificationCodeTemplateParams): string
{
    const { code, purpose, expiresInMinutes = 5, appName } = params;
    const purposeText = getPurposeText(purpose);

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verification Code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">${appName ? appName : 'Verification Code'}</h1>
    </div>
    <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="margin-bottom: 20px; font-size: 16px;">
            Please use the following verification code to ${purposeText}:
        </p>
        <div style="background: #f8f9fa; padding: 25px; border-radius: 8px; text-align: center; margin: 25px 0; border: 2px dashed #dee2e6;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #333; font-family: 'Courier New', monospace;">${code}</span>
        </div>
        <p style="color: #666; font-size: 14px; margin-top: 20px; text-align: center;">
            <strong>This code will expire in ${expiresInMinutes} minutes.</strong>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
            If you didn't request this code, please ignore this email.
        </p>
    </div>
    <div style="text-align: center; padding: 20px; color: #999; font-size: 11px;">
        <p style="margin: 0;">This is an automated message. Please do not reply.</p>
    </div>
</body>
</html>`;
}

/**
 * Generate both text and HTML versions
 */
export function verificationCodeTemplate(params: VerificationCodeTemplateParams)
{
    return {
        subject: getSubject(params.purpose),
        text: generateText(params),
        html: generateHTML(params),
    };
}
