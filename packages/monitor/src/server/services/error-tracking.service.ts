/**
 * @spfn/monitor - Error Tracking Service
 *
 * Core service for tracking errors with fingerprint-based deduplication.
 * Uses DB state transitions (new/reopened) instead of in-memory throttling
 * to determine when Slack notifications should be sent.
 */

import crypto from 'node:crypto';
import { monitorLogger } from '../logger';
import { errorGroupsRepository } from '../repositories';
import { errorEventsRepository } from '../repositories';
import { notifyErrorToSlack } from '../notifiers/slack';
import type { ErrorGroup, ErrorGroupStatus } from '../entities';

const logger = monitorLogger.errorTracking;

/**
 * Context from the error handler middleware
 */
export interface ErrorTrackingContext
{
    statusCode: number;
    path: string;
    method: string;
    requestId?: string;
    userId?: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    environment?: string;
}

/**
 * Generate a deterministic fingerprint for error deduplication
 *
 * SHA-256 of (name:message:path), first 16 hex characters
 */
export function generateFingerprint(name: string, message: string, path: string): string
{
    return crypto
        .createHash('sha256')
        .update(`${name}:${message}:${path}`)
        .digest('hex')
        .slice(0, 16);
}

/**
 * Track an error occurrence
 *
 * 1. Generate fingerprint
 * 2. Find or create error group
 * 3. Create error event
 * 4. Send Slack notification on new or reopened errors
 */
export async function trackError(
    err: Error,
    ctx: ErrorTrackingContext,
    metadata?: Record<string, unknown>,
): Promise<void>
{
    const fingerprint = generateFingerprint(
        err.name || 'Error',
        err.message,
        ctx.path,
    );

    const existing = await errorGroupsRepository.findByFingerprint(fingerprint);
    const now = new Date();

    if (!existing)
    {
        // New error — create group + event + notify
        const group = await errorGroupsRepository.create({
            fingerprint,
            name: err.name || 'Error',
            message: err.message,
            path: ctx.path,
            method: ctx.method,
            statusCode: ctx.statusCode,
            status: 'active',
            count: 1,
            firstSeenAt: now,
            lastSeenAt: now,
        });

        const event = await safeCreateEvent(group.id, err, ctx, metadata);

        logger.info('New error group tracked', { fingerprint, groupId: group.id });

        if (event)
        {
            notifyErrorToSlack(group, event, 'new', ctx.environment)
                .catch(e => logger.warn('Slack notification failed', e as Error));
        }

        return;
    }

    if (existing.status === 'resolved')
    {
        // Reopened — change status back to active + increment + notify
        await errorGroupsRepository.updateStatus(existing.id, 'active');
        await errorGroupsRepository.incrementCount(existing.id);

        const event = await safeCreateEvent(existing.id, err, ctx, metadata);

        logger.info('Error group reopened', { fingerprint, groupId: existing.id });

        if (event)
        {
            notifyErrorToSlack(
                { ...existing, status: 'active', count: existing.count + 1 },
                event,
                'reopened',
                ctx.environment,
            ).catch(e => logger.warn('Slack notification failed', e as Error));
        }

        return;
    }

    // Active or ignored — just increment count + create event (no notification)
    await errorGroupsRepository.incrementCount(existing.id);
    await safeCreateEvent(existing.id, err, ctx, metadata);
}

/**
 * Update error group status with validation
 */
export async function updateErrorGroupStatus(
    groupId: number,
    newStatus: ErrorGroupStatus,
): Promise<ErrorGroup>
{
    const group = await errorGroupsRepository.findById(groupId);
    if (!group)
    {
        throw new Error(`Error group ${groupId} not found`);
    }

    const updated = await errorGroupsRepository.updateStatus(groupId, newStatus);
    if (!updated)
    {
        throw new Error(`Failed to update error group ${groupId}`);
    }

    logger.info('Error group status updated', {
        groupId,
        from: group.status,
        to: newStatus,
    });

    return updated;
}

/**
 * Create an error event record (isolated — failure does not break group tracking)
 */
async function safeCreateEvent(
    groupId: number,
    err: Error,
    ctx: ErrorTrackingContext,
    metadata?: Record<string, unknown>,
)
{
    try
    {
        return await errorEventsRepository.create({
            groupId,
            requestId: ctx.requestId,
            userId: ctx.userId,
            statusCode: ctx.statusCode,
            headers: ctx.headers,
            query: ctx.query,
            stackTrace: err.stack,
            metadata,
        });
    }
    catch (e)
    {
        const cause = e instanceof Error && e.cause instanceof Error
            ? e.cause
            : e;
        logger.warn('Failed to create error event', cause as Error, { groupId });

        return null;
    }
}
