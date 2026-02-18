/**
 * @spfn/monitor - Log Admin Routes
 *
 * Log query routes (superadmin only)
 */

import { authenticate, requireRole } from '@spfn/auth/server';
import { Type } from '@sinclair/typebox';
import { route } from '@spfn/core/route';
import { queryLogs } from '../../services';

/**
 * GET /_monitor/admin/logs
 * Query logs with filters
 */
export const listLogs = route.get('/_monitor/admin/logs')
    .input({
        query: Type.Object({
            level: Type.Optional(Type.String({ description: 'Filter by level (debug/info/warn/error/fatal)' })),
            source: Type.Optional(Type.String({ description: 'Filter by source module' })),
            search: Type.Optional(Type.String({ description: 'Search in message' })),
            requestId: Type.Optional(Type.String({ description: 'Filter by request ID' })),
            userId: Type.Optional(Type.String({ description: 'Filter by user ID' })),
            dateFrom: Type.Optional(Type.String({ description: 'Date range start (ISO)' })),
            dateTo: Type.Optional(Type.String({ description: 'Date range end (ISO)' })),
            limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
            offset: Type.Optional(Type.Number({ minimum: 0 })),
        }),
    })
    .use([authenticate, requireRole('superadmin')])
    .handler(async (c) =>
    {
        const { query } = await c.data();

        return await queryLogs({
            level: query.level as any,
            source: query.source,
            search: query.search,
            requestId: query.requestId,
            userId: query.userId,
            dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
            dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
            limit: query.limit ?? 50,
            offset: query.offset ?? 0,
        });
    });
