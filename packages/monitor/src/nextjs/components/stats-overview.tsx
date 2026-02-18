/**
 * @spfn/monitor - Stats Overview Component
 *
 * Displays error/log counts and trend indicators
 */

import { useState, useEffect, useCallback } from 'react';
import { monitorApi } from '@spfn/monitor';
import type { MonitorStats } from '@spfn/monitor';

export function StatsOverview()
{
    const [stats, setStats] = useState<MonitorStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchStats = useCallback(async () =>
    {
        try
        {
            const data = await monitorApi.getStats.call({});
            setStats(data as MonitorStats);
        }
        finally
        {
            setIsLoading(false);
        }
    }, []);

    useEffect(() =>
    {
        fetchStats();
        const interval = setInterval(fetchStats, 30_000);
        return () => clearInterval(interval);
    }, [fetchStats]);

    if (isLoading || !stats)
    {
        return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 animate-pulse">
                        <div className="h-4 w-20 bg-neutral-200 dark:bg-neutral-700 rounded mb-2" />
                        <div className="h-8 w-12 bg-neutral-200 dark:bg-neutral-700 rounded" />
                    </div>
                ))}
            </div>
        );
    }

    const cards = [
        { label: 'Active Errors', value: stats.errors.active, color: 'text-red-600 dark:text-red-400' },
        { label: 'Resolved', value: stats.errors.resolved, color: 'text-green-600 dark:text-green-400' },
        { label: 'Ignored', value: stats.errors.ignored, color: 'text-neutral-500 dark:text-neutral-400' },
        { label: 'Errors (24h)', value: stats.trends.errorsLast24h, color: 'text-orange-600 dark:text-orange-400' },
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {cards.map((card) => (
                <div
                    key={card.label}
                    className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4"
                >
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">{card.label}</p>
                    <p className={`text-2xl font-semibold mt-1 ${card.color}`}>{card.value}</p>
                </div>
            ))}
        </div>
    );
}
