/**
 * @spfn/notification - Cancel Service
 *
 * Cancel scheduled notifications
 */

import { getBoss } from '@spfn/core/job';
import { findOne } from '@spfn/core/db';
import { notifications } from '../entities';
import { cancelScheduledNotification } from './notification.service';

export interface CancelResult
{
    success: boolean;
    error?: string;
}

/**
 * Cancel a scheduled notification by ID
 */
export async function cancelNotification(notificationId: number): Promise<CancelResult>
{
    // Find the notification
    const notification = await findOne(notifications, { id: notificationId });

    if (!notification)
    {
        return {
            success: false,
            error: 'Notification not found',
        };
    }

    if (notification.status !== 'scheduled')
    {
        return {
            success: false,
            error: `Cannot cancel notification with status: ${notification.status}`,
        };
    }

    try
    {
        // Cancel pg-boss job if exists
        if (notification.jobId)
        {
            const boss = getBoss();
            if (boss)
            {
                // Determine queue name based on channel
                const queueName = notification.channel === 'email'
                    ? 'notification.send-scheduled-email'
                    : notification.channel === 'sms'
                        ? 'notification.send-scheduled-sms'
                        : null;

                if (queueName)
                {
                    await boss.cancel(queueName, notification.jobId);
                }
            }
        }

        // Update notification status
        await cancelScheduledNotification(notificationId);

        return { success: true };
    }
    catch (error)
    {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to cancel notification',
        };
    }
}

/**
 * Cancel all scheduled notifications for a reference
 */
export async function cancelNotificationsByReference(
    referenceType: string,
    referenceId: string
): Promise<{ cancelled: number; errors: number }>
{
    const { findMany } = await import('@spfn/core/db');
    const { eq, and } = await import('drizzle-orm');

    const scheduledNotifications = await findMany(notifications, {
        where: and(
            eq(notifications.referenceType, referenceType),
            eq(notifications.referenceId, referenceId),
            eq(notifications.status, 'scheduled')
        ),
    });

    let cancelled = 0;
    let errors = 0;

    for (const notification of scheduledNotifications)
    {
        const result = await cancelNotification(notification.id);

        if (result.success)
        {
            cancelled++;
        }
        else
        {
            errors++;
        }
    }

    return { cancelled, errors };
}
