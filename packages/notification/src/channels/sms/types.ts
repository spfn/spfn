/**
 * @spfn/notification - SMS Channel Types
 */

import type { SendResult, ChannelProvider } from '../types';

/**
 * Parameters for sending SMS
 */
export interface SendSMSParams
{
    /**
     * Phone number(s) in E.164 format (e.g., +821012345678)
     */
    to: string | string[];

    /**
     * Template name
     */
    template?: string;

    /**
     * Template data for variable substitution
     */
    data?: Record<string, unknown>;

    /**
     * Message content (if not using template)
     */
    message?: string;
}

/**
 * SMS provider interface
 */
export interface SMSProvider extends ChannelProvider<InternalSendSMSParams, SendResult>
{
    name: 'aws-sns' | 'twilio' | string;
}

/**
 * Internal send SMS params (after template rendering)
 */
export interface InternalSendSMSParams
{
    to: string;
    message: string;
}
