/**
 * @spfn/auth - SMS Service
 *
 * SMS sending service with pluggable provider support
 *
 * Default provider: AWS SNS (if @aws-sdk/client-sns is installed)
 * Fallback: Development mode (console only)
 *
 * @example
 * ```typescript
 * // Using default provider (AWS SNS)
 * import { sendSMS } from '@spfn/auth/server/services/sms';
 *
 * await sendSMS({
 *     phone: '+821012345678',
 *     message: 'Your code is: 123456',
 *     purpose: 'verification'
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Register custom provider
 * import { registerSMSProvider, SMSProvider } from '@spfn/auth/server/services/sms';
 *
 * const twilioProvider: SMSProvider = {
 *     name: 'twilio',
 *     sendSMS: async (params) => {
 *         // Your Twilio implementation
 *         return { success: true, messageId: '...' };
 *     }
 * };
 *
 * registerSMSProvider(twilioProvider);
 * ```
 */

export { sendSMS, registerSMSProvider, getSMSProvider } from './provider';
export type { SendSMSParams, SendSMSResult, SMSProvider } from './types';
export { createAWSSNSProvider, awsSNSProvider } from './aws-sns.provider';

// Auto-register AWS SNS provider if available
import { awsSNSProvider } from './aws-sns.provider';
import { registerSMSProvider } from './provider';

if (awsSNSProvider)
{
    registerSMSProvider(awsSNSProvider);
}