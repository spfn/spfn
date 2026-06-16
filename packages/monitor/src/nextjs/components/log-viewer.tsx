/**
 * @spfn/monitor - Log Viewer Component
 *
 * Searchable, filterable log list with expandable metadata
 */

import { useState, useEffect } from 'react';
import { monitorApi } from '@spfn/monitor';

const LEVEL_BADGE: Record<string, string> = {
    debug: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    warn: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    fatal: 'bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300',
};

export function LogViewer()
{
    const [level, setLevel] = useState('');
    const [search, setSearch] = useState('');
    const [logs, setLogs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());

    useEffect(() =>
    {
        let cancelled = false;
        setIsLoading(true);

        monitorApi.listLogs.call({
            query: {
                ...(level ? { level } : {}),
                ...(search ? { search } : {}),
                limit: 100,
            },
        }).then((data) =>
        {
            if (!cancelled)
            {
                setLogs(data as any[]);
                setIsLoading(false);
            }
        }).catch(() =>
        {
            if (!cancelled)
            {
                setIsLoading(false);
            }
        });

        return () => 
        {
            cancelled = true; 
        };
    }, [level, search]);

    function toggleExpand(id: number)
    {
        setExpanded((prev) =>
        {
            const next = new Set(prev);
            if (next.has(id))
            {
                next.delete(id);
            }
            else
            {
                next.add(id);
            }

            return next;
        });
    }

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-3">
                <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-sm"
                >
                    <option value="">All levels</option>
                    <option value="debug">Debug</option>
                    <option value="info">Info</option>
                    <option value="warn">Warn</option>
                    <option value="error">Error</option>
                    <option value="fatal">Fatal</option>
                </select>
                <input
                    type="text"
                    placeholder="Search logs..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-sm flex-1"
                />
            </div>

            {/* Log List */}
            {isLoading ? (
                <div className="text-sm text-neutral-500">Loading...</div>
            ) : logs.length === 0 ? (
                <div className="text-sm text-neutral-500 py-8 text-center">No logs found</div>
            ) : (
                <div className="space-y-1">
                    {logs.map((log: any) => (
                        <div
                            key={log.id}
                            className="rounded border border-neutral-200 dark:border-neutral-800 text-sm"
                        >
                            <div
                                onClick={() => log.metadata && toggleExpand(log.id)}
                                className={`flex items-start gap-3 p-2 ${log.metadata ? 'cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50' : ''}`}
                            >
                                <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${LEVEL_BADGE[log.level] ?? ''}`}>
                                    {log.level}
                                </span>
                                <span className="flex-1 text-neutral-800 dark:text-neutral-200">
                                    {log.message}
                                </span>
                                {log.source && (
                                    <span className="text-xs text-neutral-400 font-mono">{log.source}</span>
                                )}
                                <span className="text-xs text-neutral-400 whitespace-nowrap">
                                    {new Date(log.createdAt).toLocaleTimeString()}
                                </span>
                            </div>
                            {expanded.has(log.id) && log.metadata && (
                                <pre className="px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 overflow-x-auto">
                                    {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
