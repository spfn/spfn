/**
 * @spfn/monitor - Monitor Dashboard Component
 *
 * Main entry point combining StatsOverview, ErrorListView, and LogViewer in tabs
 */

import { useState } from 'react';
import { StatsOverview } from './stats-overview';
import { ErrorListView } from './error-list-view';
import { ErrorDetailView } from './error-detail-view';
import { LogViewer } from './log-viewer';

type Tab = 'errors' | 'logs';

export function MonitorDashboard()
{
    const [tab, setTab] = useState<Tab>('errors');
    const [selectedErrorId, setSelectedErrorId] = useState<number | null>(null);

    return (
        <div className="space-y-6">
            {/* Stats */}
            <StatsOverview />

            {/* Tabs */}
            <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
                <TabButton active={tab === 'errors'} onClick={() => { setTab('errors'); setSelectedErrorId(null); }}>
                    Errors
                </TabButton>
                <TabButton active={tab === 'logs'} onClick={() => setTab('logs')}>
                    Logs
                </TabButton>
            </div>

            {/* Content */}
            {tab === 'errors' && !selectedErrorId && (
                <ErrorListView onSelect={setSelectedErrorId} />
            )}
            {tab === 'errors' && selectedErrorId && (
                <ErrorDetailView
                    errorId={selectedErrorId}
                    onBack={() => setSelectedErrorId(null)}
                />
            )}
            {tab === 'logs' && (
                <LogViewer />
            )}
        </div>
    );
}

function TabButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
})
{
    return (
        <button
            onClick={onClick}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                    ? 'border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
        >
            {children}
        </button>
    );
}
