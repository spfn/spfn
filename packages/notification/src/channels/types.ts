/**
 * @spfn/notification - Channel Types
 */

/**
 * Channel types
 */
export type NotificationChannel = 'email' | 'sms' | 'slack' | 'push';

/**
 * Send result
 */
export interface SendResult
{
    success: boolean;
    messageId?: string;
    error?: string;
}

/**
 * Channel provider interface
 */
export interface ChannelProvider<TSendParams, TResult = SendResult>
{
    name: string;
    send(params: TSendParams): Promise<TResult>;
}
