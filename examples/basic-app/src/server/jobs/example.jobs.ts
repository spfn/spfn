/**
 * Example Jobs
 *
 * Background job definitions for example domain
 */

import { job } from '@spfn/core/job';
import { Type } from '@sinclair/typebox';
import { exampleCreated, exampleUpdated, exampleDeleted } from '../events/example.events';

/**
 * Event-triggered: Log when example is created
 */
export const onExampleCreated = job('on-example-created')
    .on(exampleCreated)
    .handler(async (payload) =>
    {
        console.log(`[Job:on-example-created] Example created: ${payload.name} (id: ${payload.id})`);
        // Add your business logic here:
        // - Send welcome email
        // - Update analytics
        // - Notify external services
    });

/**
 * Event-triggered: Log when example is updated
 */
export const onExampleUpdated = job('on-example-updated')
    .on(exampleUpdated)
    .handler(async (payload) =>
    {
        console.log(`[Job:on-example-updated] Example updated: ${payload.name} (id: ${payload.id})`);
    });

/**
 * Event-triggered: Cleanup when example is deleted
 */
export const onExampleDeleted = job('on-example-deleted')
    .on(exampleDeleted)
    .handler(async (payload) =>
    {
        console.log(`[Job:on-example-deleted] Example deleted (id: ${payload.id})`);
        // Add cleanup logic here:
        // - Remove related files
        // - Update search index
        // - Notify dependent services
    });

/**
 * Standard job: Send notification with typed input
 */
export const sendNotification = job('send-notification')
    .input(Type.Object({
        userId: Type.String(),
        message: Type.String(),
        type: Type.Union([
            Type.Literal('info'),
            Type.Literal('warning'),
            Type.Literal('error'),
        ]),
    }))
    .options({
        retryLimit: 3,
        retryDelay: 5000,
    })
    .handler(async (input) =>
    {
        console.log(`[Job:send-notification] To: ${input.userId}, Type: ${input.type}`);
        console.log(`[Job:send-notification] Message: ${input.message}`);
        // Add notification logic here:
        // - Send push notification
        // - Send email
        // - Send SMS
    });

/**
 * Cron job: Cleanup old data every hour
 */
export const cleanupOldData = job('cleanup-old-data')
    .cron('0 * * * *')  // Every hour at minute 0
    .handler(async () =>
    {
        console.log(`[Job:cleanup-old-data] Running scheduled cleanup at ${new Date().toISOString()}`);
        // Add cleanup logic here:
        // - Delete expired sessions
        // - Archive old records
        // - Clear temporary files
    });

/**
 * Run-once job: Initialize cache on server start
 */
export const initializeCache = job('initialize-cache')
    .runOnce()
    .handler(async () =>
    {
        console.log('[Job:initialize-cache] Warming up cache on server start...');
        // Add initialization logic here:
        // - Pre-load frequently accessed data
        // - Initialize connection pools
        // - Validate configurations
    });
