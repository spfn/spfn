/**
 * @spfn/notification - Notification Service
 *
 * Core service for tracking notification history
 */

import { create, createMany, findOne, findMany, updateOne, count } from '@spfn/core/db';
import { desc, eq, and, gte, lte } from 'drizzle-orm';
import {
    notifications,
    type Notification,
    type NewNotification,
    type NotificationChannel,
    type NotificationStatus,
} from '../entities';

/**
 * Create notification record (pending status)
 */
export async function createNotificationRecord(
    data: Omit<NewNotification, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Notification>
{
    return await create(notifications, {
        ...data,
        status: 'pending',
    });
}

/**
 * Bulk create notification records (pending status)
 */
export async function createNotificationRecords(
    data: Omit<NewNotification, 'id' | 'createdAt' | 'updatedAt'>[]
): Promise<Notification[]>
{
    return await createMany(notifications, data.map((d) => ({
        ...d,
        status: 'pending' as const,
    })));
}

/**
 * Create scheduled notification record
 */
export async function createScheduledNotification(
    data: Omit<NewNotification, 'id' | 'createdAt' | 'updatedAt' | 'status'> & {
        scheduledAt: Date;
    }
): Promise<Notification>
{
    return await create(notifications, {
        ...data,
        status: 'scheduled',
    });
}

/**
 * Update job ID for scheduled notification
 */
export async function updateNotificationJobId(
    id: number,
    jobId: string
): Promise<Notification | null>
{
    return await updateOne(notifications, { id }, { jobId });
}

/**
 * Mark notification as sent
 */
export async function markNotificationSent(
    id: number,
    providerMessageId?: string
): Promise<Notification | null>
{
    return await updateOne(
        notifications,
        { id },
        {
            status: 'sent',
            sentAt: new Date(),
            providerMessageId,
        }
    );
}

/**
 * Mark notification as failed
 */
export async function markNotificationFailed(
    id: number,
    errorMessage: string
): Promise<Notification | null>
{
    return await updateOne(
        notifications,
        { id },
        {
            status: 'failed',
            errorMessage,
        }
    );
}

/**
 * Mark scheduled notification as pending (job started)
 */
export async function markNotificationPending(
    id: number
): Promise<Notification | null>
{
    return await updateOne(
        notifications,
        { id },
        { status: 'pending' }
    );
}

/**
 * Cancel scheduled notification
 */
export async function cancelScheduledNotification(
    id: number
): Promise<Notification | null>
{
    return await updateOne(
        notifications,
        { id },
        { status: 'cancelled' }
    );
}

/**
 * Find notification by job ID
 */
export async function findNotificationByJobId(
    jobId: string
): Promise<Notification | null>
{
    return await findOne(notifications, { jobId });
}

/**
 * Query options for finding notifications
 */
export interface FindNotificationsOptions
{
    channel?: NotificationChannel;
    status?: NotificationStatus;
    recipient?: string;
    referenceType?: string;
    referenceId?: string;
    from?: Date;
    to?: Date;
    limit?: number;
    offset?: number;
}

/**
 * Find notifications with filters
 */
export async function findNotifications(
    options: FindNotificationsOptions = {}
): Promise<Notification[]>
{
    const conditions = [];

    if (options.channel)
    {
        conditions.push(eq(notifications.channel, options.channel));
    }
    if (options.status)
    {
        conditions.push(eq(notifications.status, options.status));
    }
    if (options.recipient)
    {
        conditions.push(eq(notifications.recipient, options.recipient));
    }
    if (options.referenceType)
    {
        conditions.push(eq(notifications.referenceType, options.referenceType));
    }
    if (options.referenceId)
    {
        conditions.push(eq(notifications.referenceId, options.referenceId));
    }
    if (options.from)
    {
        conditions.push(gte(notifications.createdAt, options.from));
    }
    if (options.to)
    {
        conditions.push(lte(notifications.createdAt, options.to));
    }

    return await findMany(notifications, {
        where: conditions.length > 0 ? and(...conditions) : undefined,
        orderBy: desc(notifications.createdAt),
        limit: options.limit,
        offset: options.offset,
    });
}

/**
 * Count notifications with filters
 */
export async function countNotifications(
    options: Omit<FindNotificationsOptions, 'limit' | 'offset'> = {}
): Promise<number>
{
    const conditions = [];

    if (options.channel)
    {
        conditions.push(eq(notifications.channel, options.channel));
    }
    if (options.status)
    {
        conditions.push(eq(notifications.status, options.status));
    }
    if (options.recipient)
    {
        conditions.push(eq(notifications.recipient, options.recipient));
    }

    if (conditions.length > 0)
    {
        return await count(notifications, and(...conditions));
    }

    return await count(notifications);
}

/**
 * Get notification statistics
 */
export interface NotificationStats
{
    total: number;
    scheduled: number;
    pending: number;
    sent: number;
    failed: number;
    cancelled: number;
}

export async function getNotificationStats(
    options: { channel?: NotificationChannel; from?: Date; to?: Date } = {}
): Promise<NotificationStats>
{
    const [total, scheduled, pending, sent, failed, cancelled] = await Promise.all([
        countNotifications(options),
        countNotifications({ ...options, status: 'scheduled' }),
        countNotifications({ ...options, status: 'pending' }),
        countNotifications({ ...options, status: 'sent' }),
        countNotifications({ ...options, status: 'failed' }),
        countNotifications({ ...options, status: 'cancelled' }),
    ]);

    return { total, scheduled, pending, sent, failed, cancelled };
}

/**
 * Find scheduled notifications (for dashboard)
 */
export async function findScheduledNotifications(
    options: {
        channel?: NotificationChannel;
        from?: Date;
        to?: Date;
        limit?: number;
        offset?: number;
    } = {}
): Promise<Notification[]>
{
    const conditions = [eq(notifications.status, 'scheduled')];

    if (options.channel)
    {
        conditions.push(eq(notifications.channel, options.channel));
    }
    if (options.from)
    {
        conditions.push(gte(notifications.scheduledAt, options.from));
    }
    if (options.to)
    {
        conditions.push(lte(notifications.scheduledAt, options.to));
    }

    return await findMany(notifications, {
        where: and(...conditions),
        orderBy: desc(notifications.scheduledAt),
        limit: options.limit,
        offset: options.offset,
    });
}
