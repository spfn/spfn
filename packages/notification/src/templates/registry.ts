/**
 * @spfn/notification - Template Registry
 */

import type {
    TemplateDefinition,
    TemplateData,
    RenderedTemplate,
    EmailTemplateContent,
    SmsTemplateContent,
    SlackTemplateContent,
} from './types';
import type { NotificationChannel } from '../channels/types';
import { render } from './renderer';
import { getAppName } from '../config';

/**
 * Template registry storage
 */
const templates = new Map<string, TemplateDefinition>();

/**
 * Register a template
 */
export function registerTemplate(template: TemplateDefinition): void
{
    templates.set(template.name, template);
}

/**
 * Get template by name
 */
export function getTemplate(name: string): TemplateDefinition | undefined
{
    return templates.get(name);
}

/**
 * Check if template exists
 */
export function hasTemplate(name: string): boolean
{
    return templates.has(name);
}

/**
 * Check if template supports a channel
 */
export function templateSupportsChannel(name: string, channel: NotificationChannel): boolean
{
    const template = templates.get(name);
    if (!template) return false;

    return template.channels.includes(channel);
}

/**
 * Render template with data
 */
export function renderTemplate(
    name: string,
    data: TemplateData,
    channel?: NotificationChannel,
): RenderedTemplate
{
    const template = templates.get(name);
    if (!template)
    {
        throw new Error(`Template not found: ${name}`);
    }

    // Add default data
    const fullData: TemplateData = {
        appName: getAppName(),
        ...data,
    };

    const result: RenderedTemplate = {};

    // Render email if requested or no specific channel
    if ((!channel || channel === 'email') && template.email)
    {
        result.email = renderEmailTemplate(template.email, fullData);
    }

    // Render SMS if requested or no specific channel
    if ((!channel || channel === 'sms') && template.sms)
    {
        result.sms = renderSmsTemplate(template.sms, fullData);
    }

    // Render Slack if requested or no specific channel
    if ((!channel || channel === 'slack') && template.slack)
    {
        result.slack = renderSlackTemplate(template.slack, fullData);
    }

    return result;
}

/**
 * Render email template
 */
function renderEmailTemplate(
    template: EmailTemplateContent,
    data: TemplateData,
): EmailTemplateContent
{
    return {
        subject: render(template.subject, data),
        html: template.html ? render(template.html, data) : undefined,
        text: template.text ? render(template.text, data) : undefined,
    };
}

/**
 * Render SMS template
 */
function renderSmsTemplate(
    template: SmsTemplateContent,
    data: TemplateData,
): SmsTemplateContent
{
    return {
        message: render(template.message, data),
    };
}

/**
 * Render Slack template
 */
function renderSlackTemplate(
    template: SlackTemplateContent,
    data: TemplateData,
): SlackTemplateContent
{
    return {
        text: template.text ? render(template.text, data) : undefined,
        blocks: template.blocks, // Blocks are not rendered (complex structure)
    };
}

/**
 * Get all registered template names
 */
export function getTemplateNames(): string[]
{
    return Array.from(templates.keys());
}

/**
 * Clear all templates (for testing)
 */
export function clearTemplates(): void
{
    templates.clear();
}
