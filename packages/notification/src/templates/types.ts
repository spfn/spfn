/**
 * @spfn/notification - Template Types
 */

import type { NotificationChannel } from '../channels/types';

/**
 * Email template content
 */
export interface EmailTemplateContent
{
    subject: string;
    html?: string;
    text?: string;
}

/**
 * SMS template content
 */
export interface SmsTemplateContent
{
    message: string;
}

/**
 * Slack template content
 */
export interface SlackTemplateContent
{
    text?: string;
    blocks?: unknown[];
}

/**
 * Template definition
 */
export interface TemplateDefinition
{
    name: string;
    channels: NotificationChannel[];
    email?: EmailTemplateContent;
    sms?: SmsTemplateContent;
    slack?: SlackTemplateContent;
    /**
     * The rendered output carries a credential (OTP code, magic link, …).
     * Sends using a sensitive template keep content and template data out of
     * history rows. A per-send `sensitive` value overrides this.
     */
    sensitive?: boolean;
}

/**
 * Rendered template result
 */
export interface RenderedTemplate
{
    email?: EmailTemplateContent;
    sms?: SmsTemplateContent;
    slack?: SlackTemplateContent;
}

/**
 * Template data (variables for substitution)
 */
export type TemplateData = Record<string, unknown>;
