/**
 * @spfn/auth - Email Provider Management
 *
 * Manages email provider registration and fallback behavior
 */

import { authLogger } from '../../logger';
import type { EmailProvider, SendEmailParams, SendEmailResult } from './types';

/**
 * Currently registered email provider
 */
let currentProvider: EmailProvider | null = null;

/**
 * Fallback email provider (development mode - console only)
 */
const fallbackProvider: EmailProvider = {
    name: 'fallback',
    sendEmail: async (params: SendEmailParams): Promise<SendEmailResult> =>
    {
        authLogger.email.debug('DEV MODE - Email not actually sent', {
            to: params.to,
            subject: params.subject,
            purpose: params.purpose || 'N/A',
            textPreview: params.text?.substring(0, 100) || 'N/A',
        });
        return {
            success: true,
            messageId: 'dev-mode-no-actual-email',
        };
    },
};

/**
 * Register a custom email provider
 *
 * @param provider - Custom email provider implementation
 *
 * @example
 * ```typescript
 * import { registerEmailProvider } from '@spfn/auth/server/services/email';
 *
 * const sendgridProvider = {
 *     name: 'sendgrid',
 *     sendEmail: async (params) => {
 *         // SendGrid implementation
 *         return { success: true, messageId: '...' };
 *     }
 * };
 *
 * registerEmailProvider(sendgridProvider);
 * ```
 */
export function registerEmailProvider(provider: EmailProvider): void
{
    currentProvider = provider;
    authLogger.email.info('Registered email provider', { name: provider.name });
}

/**
 * Get the current email provider
 *
 * @returns Current provider or fallback if none registered
 */
export function getEmailProvider(): EmailProvider
{
    return currentProvider || fallbackProvider;
}

/**
 * Send email using the registered provider
 *
 * Falls back to development mode (console only) if no provider is registered
 *
 * @param params - Email parameters
 * @returns Send result
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult>
{
    const provider = getEmailProvider();
    return await provider.sendEmail(params);
}
