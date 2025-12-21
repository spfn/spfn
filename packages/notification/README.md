# @spfn/notification

Multi-channel notification system for SPFN applications.

## Features

- **Multi-channel support**: Email, SMS (Slack, Push coming soon)
- **Provider pattern**: Pluggable providers (AWS SES, AWS SNS, etc.)
- **Template system**: Variable substitution with filters
- **Scheduled delivery**: Schedule notifications for later via pg-boss
- **History tracking**: Optional notification history with database storage

## Installation

```bash
pnpm add @spfn/notification
```

### Optional Dependencies

Install providers as needed:

```bash
# For AWS SES (Email)
pnpm add @aws-sdk/client-ses

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

// Bulk send
await sendEmailBulk([
    { to: 'user1@example.com', template: 'welcome', data: { name: 'John' } },
    { to: 'user2@example.com', template: 'welcome', data: { name: 'Jane' } },
]);
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

## API Reference

### Exports

```typescript
// From '@spfn/notification'
export type {
    NotificationChannel,
    SendResult,
    SendEmailParams,
    SendSMSParams,
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

    // SMS
    sendSMS,
    sendSMSBulk,
    registerSMSProvider,

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

    // Jobs
    notificationJobRouter,
};
```

## License

MIT
