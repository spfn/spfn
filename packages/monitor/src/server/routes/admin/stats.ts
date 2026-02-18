/**
 * @spfn/monitor - Stats Admin Routes
 *
 * Dashboard statistics routes (superadmin only)
 */

import { authenticate, requireRole } from '@spfn/auth/server';
import { route } from '@spfn/core/route';
import { getMonitorStats } from '../../services';

/**
 * GET /_monitor/admin/stats
 * Get dashboard statistics
 */
export const getStats = route.get('/_monitor/admin/stats')
    .use([authenticate, requireRole('superadmin')])
    .handler(async () =>
    {
        return await getMonitorStats();
    });
