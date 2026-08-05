# @spfn/notification

> **The messages your product has to send before it has anything to say**

A verification code. A password reset. An invitation. A receipt. None of these are your
product, and all of them are required before it ships. `@spfn/auth` already emits the
events — registration, invitation created, invitation accepted — and this package is what
turns those into a delivered email or SMS.

Multi-channel delivery for SPFN applications: one call site, a provider behind it, and a
record of what was sent.

## What you get

- **Multi-channel support**: Email, SMS, Slack (Push coming soon)
- **Provider pattern**: Pluggable providers (AWS SES, AWS SNS, etc.)
- **Template system**: Variable substitution with filters
- **Scheduled delivery**: Schedule notifications for later via pg-boss
- **History tracking**: Optional notification history with database storage
- **Email tracking**: Open pixel & click redirect tracking with engagement analytics

## Installation

```bash
pnpm add @spfn/notification drizzle-orm@1.0.0-rc.4
```

### Optional Dependencies

Install providers as needed:

```bash
# For AWS SES v2 (Email)
pnpm add @aws-sdk/client-sesv2

# For AWS SNS (SMS)
pnpm add @aws-sdk/client-sns
```

## Quick Start

```typescript
import { sendEmail, sendSMS, configureNotification } from '@spfn/notification/server';

// Configure (optional - uses environment variables by default)
configureNotification({
    email: {
        from: 'noreply@example.com',
    },
    defaults: {
        appName: 'MyApp',
    },
});

// Send email with template
await sendEmail({
    to: 'user@example.com',
    template: 'verification-code',
    data: { code: '123456' },
});

// Send SMS
await sendSMS({
    to: '+821012345678',
    template: 'verification-code',
    data: { code: '123456' },
});
```

## Configuration

### Environment Variables

```bash
# Email
SPFN_NOTIFICATION_EMAIL_PROVIDER=aws-ses
SPFN_NOTIFICATION_EMAIL_FROM=noreply@example.com

# SMS
SPFN_NOTIFICATION_SMS_PROVIDER=aws-sns

# Tracking
SPFN_NOTIFICATION_TRACKING_ENABLED=true
SPFN_NOTIFICATION_TRACKING_SECRET=your-hmac-secret-key
SPFN_NOTIFICATION_TRACKING_BASE_URL=https://api.example.com

# AWS Credentials
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
```

### Code Configuration

```typescript
import { configureNotification } from '@spfn/notification/server';

configureNotification({
    email: {
        provider: 'aws-ses',
        from: 'noreply@example.com',
        replyTo: 'support@example.com',
    },
    sms: {
        provider: 'aws-sns',
        defaultCountryCode: '+82',
    },
    defaults: {
        appName: 'MyApp',
    },
    enableHistory: true, // Enable notification history tracking
    tracking: {
        enabled: true,                          // Enable email tracking
        secret: 'your-hmac-secret-key',         // HMAC signing key
        baseUrl: 'https://api.example.com',     // Tracking endpoint URL
    },
});
```

## Sending Notifications

### Email

```typescript
import { sendEmail, sendEmailBulk } from '@spfn/notification/server';

// With template
await sendEmail({
    to: 'user@example.com',
    template: 'welcome',
    data: { name: 'John' },
});

// With direct content
await sendEmail({
    to: 'user@example.com',
    subject: 'Hello',
    text: 'Plain text content',
    html: '<h1>HTML content</h1>',
});

// Bulk send (in-process, parallel)
await sendEmailBulk([
    { to: 'user1@example.com', template: 'welcome', data: { name: 'John' } },
    { to: 'user2@example.com', template: 'welcome', data: { name: 'Jane' } },
], { concurrency: 20 });

// Bulk send (distributed across instances via pg-boss)
const result = await sendEmailBulk(items, { distributed: true });
// result.batchId — UUID for tracking this batch
// Actual sending happens in background via pg-boss workers
```

### SMS

```typescript
import { sendSMS, sendSMSBulk } from '@spfn/notification/server';

// With template
await sendSMS({
    to: '+821012345678',
    template: 'verification-code',
    data: { code: '123456' },
});

// With direct message
await sendSMS({
    to: '010-1234-5678', // Auto-normalized to E.164 format
    message: 'Your code is 123456',
});
```

## Scheduled Notifications

Schedule notifications for later delivery using pg-boss:

```typescript
import { scheduleEmail, scheduleSMS } from '@spfn/notification/server';

// Schedule email for 1 hour later
const result = await scheduleEmail(
    {
        to: 'user@example.com',
        template: 'reminder',
        data: { eventName: 'Meeting' },
    },
    {
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
        referenceType: 'event',
        referenceId: 'event-123',
    }
);

// Cancel scheduled notification
import { cancelNotification } from '@spfn/notification/server';
await cancelNotification(result.notificationId);
```

## Bulk Sending

All channels support bulk sending with two modes:

### In-Process Mode (default)

Sends all items in the current process with concurrency control.
Suitable for single-instance deployments or smaller batches.

```typescript
import { sendEmailBulk, sendSMSBulk, sendSlackBulk } from '@spfn/notification/server';

const result = await sendEmailBulk(items, { concurrency: 20 });
// result.results — SendResult[] in same order as input
// result.successCount / result.failureCount
// result.batchId — UUID for this batch
```

### Distributed Mode

Enqueues items to pg-boss for processing across multiple instances.
Each instance's worker fetches 50 items at a time and processes them in parallel.
Failed items are individually retried by pg-boss.

```typescript
const result = await sendEmailBulk(items, { distributed: true });
// Returns immediately with pending results
// result.results[i].messageId === 'pending:{batchId}'
```

**Distributed mode flow:**
1. Validates and renders templates
2. Batch inserts notification records (single query)
3. Applies tracking (email only)
4. Bulk inserts pg-boss jobs via `sendBatch()`
5. Returns immediately — workers process in background

**Requirements:**
- `notificationJobRouter` must be registered (see Job Router Setup below)
- pg-boss must be initialized

### Job Router Setup

Register the notification job router with your server:

```typescript
import { defineServerConfig } from '@spfn/core/server';
import { defineJobRouter } from '@spfn/core/job';
import { notificationJobRouter } from '@spfn/notification/server';

defineServerConfig()
    .jobs(defineJobRouter({
        notification: notificationJobRouter,
    }))
    .build();
```

## Template System

### Built-in Templates

| Name | Channels | Purpose |
|------|----------|---------|
| `verification-code` | email, sms | Verification codes |
| `welcome` | email | Welcome message |

### Custom Templates

```typescript
import { registerTemplate } from '@spfn/notification/server';

registerTemplate({
    name: 'order-confirmation',
    channels: ['email', 'sms'],

    email: {
        subject: '[{{appName}}] Order Confirmed',
        html: `
            <h1>Order #{{orderId}}</h1>
            <p>Thank you, {{userName}}!</p>
            <p>Total: {{amount | currency}}</p>
        `,
        text: 'Order #{{orderId}} confirmed. Total: {{amount}}',
    },

    sms: {
        message: '[{{appName}}] Order #{{orderId}} confirmed. Total: {{amount | currency}}',
    },
});
```

### Template Filters

```
{{variable}}              - Basic substitution
{{variable | uppercase}}  - Convert to uppercase
{{variable | lowercase}}  - Convert to lowercase
{{variable | currency}}   - Format as currency (1,000)
{{variable | date}}       - Format as date
{{variable | date:YYYY-MM-DD}} - Custom date format
{{variable | truncate:20}} - Truncate to length
{{variable | default:N/A}} - Default value if empty
```

### Custom Filters

```typescript
import { registerFilter } from '@spfn/notification/server';

registerFilter('phone', (value) => {
    const str = String(value);
    return `${str.slice(0, 3)}-${str.slice(3, 7)}-${str.slice(7)}`;
});

// Usage: {{phoneNumber | phone}} -> 010-1234-5678
```

## Custom Providers

### Email Provider

```typescript
import { registerEmailProvider, EmailProvider } from '@spfn/notification/server';

const sendgridProvider: EmailProvider = {
    name: 'sendgrid',
    async send(params) {
        // Your SendGrid implementation
        return { success: true, messageId: '...' };
    },
};

registerEmailProvider(sendgridProvider);
```

### SMS Provider

```typescript
import { registerSMSProvider, SMSProvider } from '@spfn/notification/server';

const twilioProvider: SMSProvider = {
    name: 'twilio',
    async send(params) {
        // Your Twilio implementation
        return { success: true, messageId: '...' };
    },
};

registerSMSProvider(twilioProvider);
```

## Logging & Error Handling

All channels log via `@spfn/core/logger`. Logs are tagged by channel:

- `@spfn/notification:email` — Email send success/failure, validation errors
- `@spfn/notification:sms` — SMS send success/failure, validation errors
- `@spfn/notification:slack` — Slack send success/failure, validation errors
- `@spfn/notification:ses` — AWS SES client lifecycle, provider errors
- `@spfn/notification:sns` — AWS SNS client lifecycle, provider errors

`sendEmail`, `sendSMS`, `sendSlack` are designed to **not throw** — they return a `SendResult` object. Always check the result:

```typescript
const result = await sendEmail({
    to: 'user@example.com',
    template: 'welcome',
    data: { name: 'John' },
});

if (!result.success)
{
    // result.error contains the failure reason
    console.error('Email failed:', result.error);
}
```

## Notification History

Enable history tracking to store all notifications in the database:

```typescript
configureNotification({
    enableHistory: true,
});
```

### Query History

```typescript
import {
    findNotifications,
    getNotificationStats,
    findScheduledNotifications,
} from '@spfn/notification/server';

// Find notifications
const notifications = await findNotifications({
    channel: 'email',
    status: 'sent',
    recipient: 'user@example.com',
    from: new Date('2024-01-01'),
    limit: 100,
});

// Get statistics
const stats = await getNotificationStats({ channel: 'email' });
// { total: 1000, scheduled: 10, pending: 5, sent: 980, failed: 3, cancelled: 2 }

// Find scheduled notifications
const scheduled = await findScheduledNotifications({
    channel: 'email',
    from: new Date(),
    to: new Date(Date.now() + 24 * 60 * 60 * 1000),
});
```

## Email Tracking

Track email opens and link clicks to measure engagement.

### How It Works

1. **Open tracking**: A 1x1 transparent GIF is inserted before `</body>`. When the email client loads the image, an open event is recorded.
2. **Click tracking**: `<a href>` links are wrapped with redirect URLs. When clicked, a click event is recorded and the user is redirected to the original URL.
3. Links with `mailto:`, `tel:`, `sms:`, `javascript:`, and `#` protocols are automatically skipped.

### Setup

Tracking requires:
- `enableHistory: true` (tracking events reference the history table via FK)
- `tracking.secret` configured (HMAC token signing)
- `tracking.baseUrl` configured (where tracking endpoints are accessible)
- `trackingRouter` registered in your app router

```typescript
import { configureNotification, trackingRouter } from '@spfn/notification/server';
import { defineRouter } from '@spfn/core/route';

configureNotification({
    enableHistory: true,
    tracking: {
        enabled: true,
        secret: 'your-hmac-secret-key',
        baseUrl: 'https://api.example.com',
    },
});

// Register tracking router (provides /_noti/t/o/:token and /_noti/t/c/:token)
const appRouter = defineRouter({ ... })
    .packages([trackingRouter]);
```

### Per-Email Control

Override the global tracking setting for individual emails:

```typescript
// Force tracking on for this email (even if globally disabled)
await sendEmail({
    to: 'user@example.com',
    template: 'campaign',
    data: { ... },
    tracking: true,
});

// Force tracking off for this email (even if globally enabled)
await sendEmail({
    to: 'admin@example.com',
    subject: 'Internal Report',
    html: '<p>...</p>',
    tracking: false,
});
```

### Priority

```
sendEmail({ tracking: true/false })              ← 1st: per-call override
configureNotification({ tracking: { enabled } }) ← 2nd: code config
SPFN_NOTIFICATION_TRACKING_ENABLED=true           ← 3rd: environment variable
```

### Tracking Endpoints

These endpoints skip authentication (accessed by email clients):

| Endpoint | Response | Action |
|----------|----------|--------|
| `GET /_noti/t/o/:token` | 200 + 1x1 GIF | Records open event |
| `GET /_noti/t/c/:token?url=...` | 302 redirect | Records click event, redirects to original URL |

- Invalid tokens still return pixel/redirect (UX protection)
- `Cache-Control: no-store` for re-open tracking
- DB writes are fire-and-forget (response speed first)

### Analytics

```typescript
import {
    getTrackingStats,
    getEngagementStats,
    getClickDetails,
} from '@spfn/notification/server';

// Stats for a specific notification
const stats = await getTrackingStats(notificationId);
// { totalOpens: 15, uniqueOpens: 8, totalClicks: 5, uniqueClicks: 3 }

// Overall engagement stats
const engagement = await getEngagementStats({ channel: 'email' });
// { sent: 1000, opened: 450, clicked: 120, openRate: 45.00, clickRate: 12.00 }

// Click details per link
const clicks = await getClickDetails(notificationId);
// [{ linkUrl: 'https://...', linkIndex: 0, totalClicks: 5, uniqueClicks: 3 }]
```

Unique counts are based on distinct IP addresses.

### Limitations

- **Open tracking is approximate**: Email clients like Apple Mail Privacy Protection may pre-fetch images, inflating open counts.
- Tracking auto-disables when `enableHistory: false` (FK dependency) or `tracking.secret` is not set.

## API Reference

### Exports

```typescript
// From '@spfn/notification'
export type {
    NotificationChannel,
    SendResult,
    SendEmailParams,
    SendSMSParams,
    SendSlackParams,
    TemplateDefinition,
    TemplateData,
};

// From '@spfn/notification/server'
export {
    // Configuration
    configureNotification,
    getNotificationConfig,

    // Email
    sendEmail,
    sendEmailBulk,
    registerEmailProvider,
    type BulkEmailResult,
    type BulkEmailOptions,

    // SMS
    sendSMS,
    sendSMSBulk,
    registerSMSProvider,
    type BulkSMSResult,
    type BulkSMSOptions,

    // Slack
    sendSlack,
    sendSlackBulk,
    registerSlackProvider,
    type BulkSlackResult,
    type BulkSlackOptions,

    // Scheduling
    scheduleEmail,
    scheduleSMS,
    cancelNotification,

    // Templates
    registerTemplate,
    renderTemplate,
    registerFilter,

    // History
    findNotifications,
    getNotificationStats,

    // Tracking
    trackingRouter,
    processTrackingHtml,
    getTrackingStats,
    getEngagementStats,
    getClickDetails,
    isTrackingEnabled,

    // Jobs
    notificationJobRouter,
    sendBulkEmailItemJob,
    sendBulkSmsItemJob,
    sendBulkSlackItemJob,
};
```

## License

MIT
