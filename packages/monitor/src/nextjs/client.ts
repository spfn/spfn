/**
 * @spfn/monitor - Next.js Client Components
 *
 * Client-side components for the monitoring dashboard.
 * These are 'use client' components that can be used in Next.js pages.
 *
 * @example
 * ```tsx
 * // app/admin/monitor/page.tsx
 * import { MonitorDashboard } from '@spfn/monitor/nextjs/client';
 *
 * export default function MonitorPage() {
 *     return <MonitorDashboard />;
 * }
 * ```
 */

export { MonitorDashboard } from './components/monitor-dashboard';
export { StatsOverview } from './components/stats-overview';
export { ErrorListView } from './components/error-list-view';
export { ErrorDetailView } from './components/error-detail-view';
export { LogViewer } from './components/log-viewer';
