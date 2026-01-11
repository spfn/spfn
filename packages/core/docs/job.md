# Job

Background job processing.

## Define Jobs

```typescript
// src/server/jobs/send-email.job.ts
import { defineJob } from '@spfn/core/job';

export const sendEmailJob = defineJob<{
    to: string;
    subject: string;
    body: string;
}>({
    name: 'send-email',
    handler: async (payload) => {
        await emailService.send({
            to: payload.to,
            subject: payload.subject,
            body: payload.body
        });
    }
});
```

## Enqueue Jobs

```typescript
import { enqueue } from '@spfn/core/job';
import { sendEmailJob } from './jobs/send-email.job';

// Enqueue for immediate processing
await enqueue(sendEmailJob, {
    to: 'user@example.com',
    subject: 'Welcome',
    body: 'Welcome to our app!'
});

// Enqueue with delay
await enqueue(sendEmailJob, payload, {
    delay: 60000  // 1 minute
});

// Enqueue with options
await enqueue(sendEmailJob, payload, {
    priority: 'high',
    attempts: 3,
    backoff: 'exponential'
});
```

## Job Options

```typescript
defineJob({
    name: 'process-image',
    concurrency: 5,           // Max concurrent jobs
    attempts: 3,              // Retry attempts
    backoff: 'exponential',   // Backoff strategy
    timeout: 30000,           // Job timeout (ms)
    handler: async (payload) => {
        // ...
    }
});
```

## Scheduled Jobs

```typescript
import { schedule } from '@spfn/core/job';

// Run every hour
schedule('cleanup', '0 * * * *', async () => {
    await cleanupExpiredSessions();
});

// Run daily at midnight
schedule('daily-report', '0 0 * * *', async () => {
    await generateDailyReport();
});

// Run every 5 minutes
schedule('health-check', '*/5 * * * *', async () => {
    await checkExternalServices();
});
```

## Job Registration

```typescript
// src/server/jobs/index.ts
import { registerJobs } from '@spfn/core/job';
import { sendEmailJob } from './send-email.job';
import { processImageJob } from './process-image.job';

export function initializeJobs()
{
    registerJobs([
        sendEmailJob,
        processImageJob
    ]);
}
```

## Best Practices

```typescript
// 1. Keep jobs idempotent
handler: async (payload) => {
    // Check if already processed
    const existing = await db.findProcessed(payload.id);
    if (existing) return;

    await processItem(payload);
}

// 2. Use appropriate timeout
timeout: 30000  // Don't set too high

// 3. Handle failures gracefully
attempts: 3,
backoff: 'exponential'

// 4. Log job progress
handler: async (payload) => {
    logger.info('Processing job', { jobId: payload.id });
    // ...
    logger.info('Job completed', { jobId: payload.id });
}
```
