/**
 * @spfn/auth - Email Template Registry
 *
 * Manages custom email template registration and fallback to defaults
 */

import type { EmailTemplateProvider, VerificationCodeParams, EmailTemplateResult } from './types';
import * as defaultTemplates from './verification-code';

/**
 * Custom template overrides
 */
let customTemplates: Partial<EmailTemplateProvider> = {};

/**
 * Register custom email templates
 *
 * Templates not provided will fall back to defaults
 *
 * @param templates - Custom template implementations
 *
 * @example
 * ```typescript
 * import { registerEmailTemplates } from '@spfn/auth/server';
 *
 * // Override verification code template with custom design
 * registerEmailTemplates({
 *     verificationCode: ({ code, purpose, expiresInMinutes }) => ({
 *         subject: `[MyApp] Your verification code`,
 *         text: `Your code is: ${code}`,
 *         html: `
 *             <div style="font-family: Arial;">
 *                 <h1>Welcome to MyApp!</h1>
 *                 <p>Your code: <strong>${code}</strong></p>
 *             </div>
 *         `,
 *     }),
 * });
 * ```
 */
export function registerEmailTemplates(templates: Partial<EmailTemplateProvider>): void
{
    customTemplates = { ...customTemplates, ...templates };
    console.log(`[EMAIL TEMPLATES] Registered custom templates:`, Object.keys(templates).join(', '));
}

/**
 * Clear all custom templates (useful for testing)
 */
export function clearCustomTemplates(): void
{
    customTemplates = {};
}

/**
 * Get verification code template
 *
 * Uses custom template if registered, otherwise falls back to default
 */
export function getVerificationCodeTemplate(params: VerificationCodeParams): EmailTemplateResult
{
    if (customTemplates.verificationCode)
    {
        return customTemplates.verificationCode(params);
    }

    return defaultTemplates.verificationCodeTemplate(params);
}

/**
 * Get welcome template
 */
export function getWelcomeTemplate(params: { email: string; appName?: string }): EmailTemplateResult
{
    if (customTemplates.welcome)
    {
        return customTemplates.welcome(params);
    }

    // Default welcome template
    return {
        subject: params.appName ? `Welcome to ${params.appName}!` : 'Welcome!',
        text: `Welcome! Your account has been created successfully.`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px;">
    <h1>Welcome${params.appName ? ` to ${params.appName}` : ''}!</h1>
    <p>Your account has been created successfully.</p>
</body>
</html>`,
    };
}

/**
 * Get password reset template
 */
export function getPasswordResetTemplate(params: { resetLink: string; expiresInMinutes?: number; appName?: string }): EmailTemplateResult
{
    if (customTemplates.passwordReset)
    {
        return customTemplates.passwordReset(params);
    }

    const expires = params.expiresInMinutes || 30;

    return {
        subject: 'Reset your password',
        text: `Click this link to reset your password: ${params.resetLink}\n\nThis link will expire in ${expires} minutes.`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px;">
    <h1>Reset Your Password</h1>
    <p>Click the button below to reset your password:</p>
    <a href="${params.resetLink}" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Reset Password</a>
    <p style="color: #666; margin-top: 20px;">This link will expire in ${expires} minutes.</p>
</body>
</html>`,
    };
}

/**
 * Get invitation template
 */
export function getInvitationTemplate(params: { inviteLink: string; inviterName?: string; roleName?: string; appName?: string }): EmailTemplateResult
{
    if (customTemplates.invitation)
    {
        return customTemplates.invitation(params);
    }

    const appName = params.appName || 'our platform';
    const inviterText = params.inviterName ? `${params.inviterName} has invited you` : 'You have been invited';
    const roleText = params.roleName ? ` as ${params.roleName}` : '';

    return {
        subject: `You're invited to join ${appName}`,
        text: `${inviterText} to join ${appName}${roleText}.\n\nClick here to accept: ${params.inviteLink}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px;">
    <h1>You're Invited!</h1>
    <p>${inviterText} to join <strong>${appName}</strong>${roleText}.</p>
    <a href="${params.inviteLink}" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Accept Invitation</a>
</body>
</html>`,
    };
}
