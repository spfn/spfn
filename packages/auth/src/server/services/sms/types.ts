/**
 * @spfn/auth - SMS Service Types
 *
 * Type definitions for SMS sending service
 */

/**
 * Parameters for sending SMS
 */
export interface SendSMSParams
{
    /**
     * Phone number in E.164 format (e.g., +821012345678)
     */
    phone: string;

    /**
     * SMS message content
     */
    message: string;

    /**
     * Purpose of the SMS (for logging)
     */
    purpose?: string;
}

/**
 * Result of sending SMS
 */
export interface SendSMSResult
{
    /**
     * Whether SMS was sent successfully
     */
    success: boolean;

    /**
     * Message ID from SMS provider (if successful)
     */
    messageId?: string;

    /**
     * Error message (if failed)
     */
    error?: string;
}

/**
 * SMS Provider Interface
 *
 * Implement this interface to create custom SMS providers
 *
 * @example
 * ```typescript
 * import { SMSProvider, registerSMSProvider } from '@spfn/auth/server/services/sms';
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
export interface SMSProvider
{
    /**
     * Provider name (e.g., 'aws-sns', 'twilio', 'custom')
     */
    name: string;

    /**
     * Send SMS via this provider
     *
     * @param params - SMS parameters
     * @returns Send result
     */
    sendSMS(params: SendSMSParams): Promise<SendSMSResult>;
}
