/**
 * @spfn/auth - Email Service Types
 *
 * Type definitions for email sending service
 */

/**
 * Parameters for sending email
 */
export interface SendEmailParams
{
    /**
     * Recipient email address
     */
    to: string;

    /**
     * Email subject
     */
    subject: string;

    /**
     * Plain text content
     */
    text?: string;

    /**
     * HTML content
     */
    html?: string;

    /**
     * Purpose of the email (for logging)
     */
    purpose?: string;
}

/**
 * Result of sending email
 */
export interface SendEmailResult
{
    /**
     * Whether email was sent successfully
     */
    success: boolean;

    /**
     * Message ID from email provider (if successful)
     */
    messageId?: string;

    /**
     * Error message (if failed)
     */
    error?: string;
}

/**
 * Email Provider Interface
 *
 * Implement this interface to create custom email providers
 *
 * @example
 * ```typescript
 * import { EmailProvider, registerEmailProvider } from '@spfn/auth/server/services/email';
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
export interface EmailProvider
{
    /**
     * Provider name (e.g., 'aws-ses', 'sendgrid', 'custom')
     */
    name: string;

    /**
     * Send email via this provider
     *
     * @param params - Email parameters
     * @returns Send result
     */
    sendEmail(params: SendEmailParams): Promise<SendEmailResult>;
}
