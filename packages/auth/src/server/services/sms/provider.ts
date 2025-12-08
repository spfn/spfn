/**
 * @spfn/auth - SMS Provider Management
 *
 * Manages SMS provider registration and fallback behavior
 */

import { authLogger } from '../../logger';
import type { SMSProvider, SendSMSParams, SendSMSResult } from './types';

/**
 * Currently registered SMS provider
 */
let currentProvider: SMSProvider | null = null;

/**
 * Fallback SMS provider (development mode - console only)
 */
const fallbackProvider: SMSProvider = {
    name: 'fallback',
    sendSMS: async (params: SendSMSParams): Promise<SendSMSResult> =>
    {
        authLogger.sms.debug('DEV MODE - SMS not actually sent', {
            phone: params.phone,
            message: params.message,
            purpose: params.purpose || 'N/A',
        });
        return {
            success: true,
            messageId: 'dev-mode-no-actual-sms',
        };
    },
};

/**
 * Register a custom SMS provider
 *
 * @param provider - Custom SMS provider implementation
 *
 * @example
 * ```typescript
 * import { registerSMSProvider } from '@spfn/auth/server/services/sms';
 *
 * const twilioProvider = {
 *     name: 'twilio',
 *     sendSMS: async (params) => {
 *         // Twilio implementation
 *         return { success: true, messageId: '...' };
 *     }
 * };
 *
 * registerSMSProvider(twilioProvider);
 * ```
 */
export function registerSMSProvider(provider: SMSProvider): void
{
    currentProvider = provider;
    authLogger.sms.info('Registered SMS provider', { name: provider.name });
}

/**
 * Get the current SMS provider
 *
 * @returns Current provider or fallback if none registered
 */
export function getSMSProvider(): SMSProvider
{
    return currentProvider || fallbackProvider;
}

/**
 * Send SMS using the registered provider
 *
 * Falls back to development mode (console only) if no provider is registered
 *
 * @param params - SMS parameters
 * @returns Send result
 */
export async function sendSMS(params: SendSMSParams): Promise<SendSMSResult>
{
    const provider = getSMSProvider();
    return await provider.sendSMS(params);
}