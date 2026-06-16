/**
 * @spfn/notification - Tracking Service
 *
 * Records engagement events and provides analytics queries.
 */

import { create, getDatabase } from '@spfn/core/db';
import { eq, and, gte, lte, count as drizzleCount, countDistinct } from 'drizzle-orm';
import { trackingEvents, type TrackingEventType } from '../entities';
import { notifications, type NotificationChannel } from '../entities';
import { logger } from '@spfn/core/logger';

const log = logger.child('@spfn/notification:tracking');

// ─── Record Functions (fire-and-forget) ───────────────────────────

/**
 * Record an open event (fire-and-forget)
 */
export function recordOpenEvent(
    notificationId: number,
    meta?: { ipAddress?: string; userAgent?: string },
): void
{
    create(trackingEvents, {
        notificationId,
        type: 'open',
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
    }).catch((error) =>
    {
        log.warn('Failed to record open event', error as Error);
    });
}

/**
 * Record a click event (fire-and-forget)
 */
export function recordClickEvent(
    notificationId: number,
    linkIndex: number,
    linkUrl: string,
    meta?: { ipAddress?: string; userAgent?: string },
): void
{
    create(trackingEvents, {
        notificationId,
        type: 'click',
        linkUrl,
        linkIndex,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
    }).catch((error) =>
    {
        log.warn('Failed to record click event', error as Error);
    });
}

// ─── Analytics Functions ──────────────────────────────────────────

/**
 * Tracking stats for a single notification
 */
export interface TrackingStats
{
    totalOpens: number;
    uniqueOpens: number;
    totalClicks: number;
    uniqueClicks: number;
}

/**
 * Get tracking stats for a specific notification
 */
export async function getTrackingStats(notificationId: number): Promise<TrackingStats>
{
    const db = getDatabase('read');

    const rows = await db
        .select({
            type: trackingEvents.type,
            total: drizzleCount(),
            unique: countDistinct(trackingEvents.ipAddress),
        })
        .from(trackingEvents)
        .where(eq(trackingEvents.notificationId, notificationId))
        .groupBy(trackingEvents.type);

    const openRow = rows.find((r) => r.type === 'open');
    const clickRow = rows.find((r) => r.type === 'click');

    return {
        totalOpens: Number(openRow?.total ?? 0),
        uniqueOpens: Number(openRow?.unique ?? 0),
        totalClicks: Number(clickRow?.total ?? 0),
        uniqueClicks: Number(clickRow?.unique ?? 0),
    };
}

/**
 * Engagement stats across notifications
 */
export interface EngagementStats
{
    sent: number;
    opened: number;
    clicked: number;
    openRate: number;
    clickRate: number;
}

/**
 * Get engagement stats with optional filters
 */
export async function getEngagementStats(
    options: { channel?: NotificationChannel; from?: Date; to?: Date } = {},
): Promise<EngagementStats>
{
    const db = getDatabase('read');

    // Count sent notifications
    const sentConditions = [eq(notifications.status, 'sent')];
    if (options.channel)
    {
        sentConditions.push(eq(notifications.channel, options.channel));
    }
    if (options.from)
    {
        sentConditions.push(gte(notifications.createdAt, options.from));
    }
    if (options.to)
    {
        sentConditions.push(lte(notifications.createdAt, options.to));
    }

    const [sentResult] = await db
        .select({ count: drizzleCount() })
        .from(notifications)
        .where(and(...sentConditions));

    const sent = Number(sentResult?.count ?? 0);

    if (sent === 0)
    {
        return { sent: 0, opened: 0, clicked: 0, openRate: 0, clickRate: 0 };
    }

    // Count unique notifications with open/click events
    const eventConditions = [];
    if (options.from)
    {
        eventConditions.push(gte(trackingEvents.createdAt, options.from));
    }
    if (options.to)
    {
        eventConditions.push(lte(trackingEvents.createdAt, options.to));
    }

    const openConditions = [
        eq(trackingEvents.type, 'open' as TrackingEventType),
        ...eventConditions,
    ];
    const clickConditions = [
        eq(trackingEvents.type, 'click' as TrackingEventType),
        ...eventConditions,
    ];

    const [[openResult], [clickResult]] = await Promise.all([
        db
            .select({ count: countDistinct(trackingEvents.notificationId) })
            .from(trackingEvents)
            .where(and(...openConditions)),
        db
            .select({ count: countDistinct(trackingEvents.notificationId) })
            .from(trackingEvents)
            .where(and(...clickConditions)),
    ]);

    const opened = Number(openResult?.count ?? 0);
    const clicked = Number(clickResult?.count ?? 0);

    return {
        sent,
        opened,
        clicked,
        openRate: sent > 0 ? Number((opened / sent * 100).toFixed(2)) : 0,
        clickRate: sent > 0 ? Number((clicked / sent * 100).toFixed(2)) : 0,
    };
}

/**
 * Click detail for a specific link
 */
export interface ClickDetail
{
    linkUrl: string;
    linkIndex: number;
    totalClicks: number;
    uniqueClicks: number;
}

/**
 * Get click details for a specific notification
 */
export async function getClickDetails(notificationId: number): Promise<ClickDetail[]>
{
    const db = getDatabase('read');

    const rows = await db
        .select({
            linkUrl: trackingEvents.linkUrl,
            linkIndex: trackingEvents.linkIndex,
            totalClicks: drizzleCount(),
            uniqueClicks: countDistinct(trackingEvents.ipAddress),
        })
        .from(trackingEvents)
        .where(
            and(
                eq(trackingEvents.notificationId, notificationId),
                eq(trackingEvents.type, 'click'),
            ),
        )
        .groupBy(trackingEvents.linkUrl, trackingEvents.linkIndex)
        .orderBy(trackingEvents.linkIndex);

    return rows.map((row) => ({
        linkUrl: row.linkUrl ?? '',
        linkIndex: row.linkIndex ?? 0,
        totalClicks: Number(row.totalClicks),
        uniqueClicks: Number(row.uniqueClicks),
    }));
}
