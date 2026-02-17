/**
 * @spfn/notification - Slack Channel Types
 */

import type { ChannelProvider } from '../types';

/**
 * Parameters for sending Slack message
 */
export interface SendSlackParams
{
    /**
     * Webhook URL (overrides env/config default)
     */
    webhookUrl?: string;

    /**
     * Plain text message
     */
    text?: string;

    /**
     * Slack Block Kit blocks
     */
    blocks?: unknown[];

    /**
     * Template name
     */
    template?: string;

    /**
     * Template data for variable substitution
     */
    data?: Record<string, unknown>;
}

/**
 * Slack provider interface
 */
export interface SlackProvider extends ChannelProvider<InternalSendSlackParams>
{
    name: 'webhook' | string;
}

/**
 * Internal send Slack params (after template rendering)
 */
export interface InternalSendSlackParams
{
    webhookUrl: string;
    text?: string;
    blocks?: unknown[];
}
