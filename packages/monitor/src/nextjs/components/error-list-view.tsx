/**
 * @spfn/monitor - Error List View Component
 *
 * Displays error groups in a filterable table with status badges
 */

import { useState, useEffect } from 'react';
import { monitorApi } from '@spfn/monitor';
import type { ErrorGroupStatus } from '@spfn/monitor';

interface ErrorListViewProps
{
    onSelect?: (id: number) => void;
}

const STATUS_BADGE: Record<ErrorGroupStatus, string> = {
    active: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    resolved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    ignored: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
};

export function ErrorListView({ onSelect }: ErrorListViewProps)
{
    const [status, setStatus] = useState<string>('');
    const [search, setSearch] = useState('');
    const [errors, setErrors] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() =>
    {
        let cancelled = false;
        setIsLoading(true);

        monitorApi.listErrors.call({
            query: {
                ...(status ? { status } : {}),
                ...(search ? { search } : {}),
                limit: 50,
            },
        }).then((data) =>
        {
            if (!cancelled)
            {
                setErrors(data as any[]);
                setIsLoading(false);
            }
        }).catch(() =>
        {
            if (!cancelled)
            {
                setIsLoading(false);
            }
        });

        return () => { cancelled = true; };
    }, [status, search]);

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-3">
                <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-sm"
                >
                    <option value="">All statuses</option>
                    <option value="active">Active</option>
                    <option value="resolved">Resolved</option>
                    <option value="ignored">Ignored</option>
                </select>
                <input
                    type="text"
                    placeholder="Search errors..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-sm flex-1"
                />
            </div>

            {/* Table */}
            {isLoading ? (
                <div className="text-sm text-neutral-500">Loading...</div>
            ) : errors.length === 0 ? (
                <div className="text-sm text-neutral-500 py-8 text-center">No errors found</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-neutral-200 dark:border-neutral-800 text-left text-neutral-500">
                                <th className="py-2 pr-4">Status</th>
                                <th className="py-2 pr-4">Error</th>
                                <th className="py-2 pr-4">Path</th>
                                <th className="py-2 pr-4 text-right">Count</th>
                                <th className="py-2 text-right">Last Seen</th>
                            </tr>
                        </thead>
                        <tbody>
                            {errors.map((group: any) => (
                                <tr
                                    key={group.id}
                                    onClick={() => onSelect?.(group.id)}
                                    className="border-b border-neutral-100 dark:border-neutral-800/50 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer"
                                >
                                    <td className="py-2 pr-4">
                                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[group.status as ErrorGroupStatus]}`}>
                                            {group.status}
                                        </span>
                                    </td>
                                    <td className="py-2 pr-4">
                                        <div className="font-medium text-neutral-900 dark:text-neutral-100">{group.name}</div>
                                        <div className="text-neutral-500 truncate max-w-xs">{group.message}</div>
                                    </td>
                                    <td className="py-2 pr-4 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                                        {group.method} {group.path}
                                    </td>
                                    <td className="py-2 pr-4 text-right font-mono">{group.count}</td>
                                    <td className="py-2 text-right text-neutral-500">
                                        {formatRelativeTime(group.lastSeenAt)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function formatRelativeTime(date: string | Date): string
{
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = Date.now();
    const diff = now - d.getTime();
    const mins = Math.floor(diff / 60_000);

    if (mins < 1)
    {
        return 'just now';
    }

    if (mins < 60)
    {
        return `${mins}m ago`;
    }

    const hours = Math.floor(mins / 60);
    if (hours < 24)
    {
        return `${hours}h ago`;
    }

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}
