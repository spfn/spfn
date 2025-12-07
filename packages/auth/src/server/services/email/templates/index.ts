/**
 * @spfn/auth - Email Templates
 *
 * Centralized email template management with customization support
 *
 * @example
 * ```typescript
 * // Use default templates
 * import { getVerificationCodeTemplate } from '@spfn/auth/server';
 *
 * const { subject, text, html } = getVerificationCodeTemplate({
 *     code: '123456',
 *     purpose: 'registration',
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Register custom templates
 * import { registerEmailTemplates } from '@spfn/auth/server';
 *
 * registerEmailTemplates({
 *     verificationCode: ({ code, purpose }) => ({
 *         subject: '[MyApp] Verification Code',
 *         text: `Your code: ${code}`,
 *         html: `<h1>${code}</h1>`,
 *     }),
 * });
 * ```
 */

// Types
export type {
    EmailTemplateResult,
    EmailTemplateProvider,
    VerificationCodeParams,
} from './types';

// Registry (main API)
export {
    registerEmailTemplates,
    clearCustomTemplates,
    getVerificationCodeTemplate,
    getWelcomeTemplate,
    getPasswordResetTemplate,
    getInvitationTemplate,
} from './registry';

// Default templates (for reference/extension)
export { verificationCodeTemplate } from './verification-code';
export type { VerificationCodeTemplateParams } from './verification-code';
