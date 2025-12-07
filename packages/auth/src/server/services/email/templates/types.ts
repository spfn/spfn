/**
 * @spfn/auth - Email Template Types
 *
 * Type definitions for customizable email templates
 */

/**
 * Common template result
 */
export interface EmailTemplateResult
{
    subject: string;
    text: string;
    html: string;
}

/**
 * Verification code template parameters
 */
export interface VerificationCodeParams
{
    code: string;
    purpose: 'registration' | 'login' | 'password_reset' | string;
    expiresInMinutes?: number;
    appName?: string;
}

/**
 * Email template provider interface
 *
 * Implement this interface to create custom email templates
 *
 * @example
 * ```typescript
 * import { registerEmailTemplates } from '@spfn/auth/server';
 *
 * registerEmailTemplates({
 *     verificationCode: (params) => ({
 *         subject: 'Your Code',
 *         text: `Code: ${params.code}`,
 *         html: `<h1>Code: ${params.code}</h1>`,
 *     }),
 * });
 * ```
 */
export interface EmailTemplateProvider
{
    /**
     * Verification code email template
     */
    verificationCode?(params: VerificationCodeParams): EmailTemplateResult;

    /**
     * Welcome email template (after registration)
     */
    welcome?(params: { email: string; appName?: string }): EmailTemplateResult;

    /**
     * Password reset email template
     */
    passwordReset?(params: { resetLink: string; expiresInMinutes?: number; appName?: string }): EmailTemplateResult;

    /**
     * Invitation email template
     */
    invitation?(params: { inviteLink: string; inviterName?: string; roleName?: string; appName?: string }): EmailTemplateResult;
}
