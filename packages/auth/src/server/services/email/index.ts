/**
 * @spfn/auth - Email Service
 *
 * Email sending service with pluggable provider support
 *
 * Default provider: AWS SES (if @aws-sdk/client-ses is installed)
 * Fallback: Development mode (console only)
 *
 * @example
 * ```typescript
 * // Using default provider (AWS SES)
 * import { sendEmail } from '@spfn/auth/server/services/email';
 *
 * await sendEmail({
 *     to: 'user@example.com',
 *     subject: 'Your Verification Code',
 *     text: 'Your code is: 123456',
 *     html: '<p>Your code is: <strong>123456</strong></p>',
 *     purpose: 'verification'
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Register custom provider
 * import { registerEmailProvider, EmailProvider } from '@spfn/auth/server/services/email';
 *
 * const sendgridProvider: EmailProvider = {
 *     name: 'sendgrid',
 *     sendEmail: async (params) => {
 *         // Your SendGrid implementation
 *         return { success: true, messageId: '...' };
 *     }
 * };
 *
 * registerEmailProvider(sendgridProvider);
 * ```
 */

export { sendEmail, registerEmailProvider, getEmailProvider } from './provider';
export type { SendEmailParams, SendEmailResult, EmailProvider } from './types';
export { createAWSSESProvider, awsSESProvider } from './aws-ses.provider';

// Auto-register AWS SES provider if available
import { awsSESProvider } from './aws-ses.provider';
import { registerEmailProvider } from './provider';

if (awsSESProvider)
{
    registerEmailProvider(awsSESProvider);
}
