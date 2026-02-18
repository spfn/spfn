/**
 * @spfn/monitor - Error Admin Routes
 *
 * CRUD routes for error group management (superadmin only)
 */

import { authenticate, requireRole } from '@spfn/auth/server';
import { Type } from '@sinclair/typebox';
import { route } from '@spfn/core/route';
import { errorGroupsRepository, errorEventsRepository } from '../../repositories';
import { updateErrorGroupStatus } from '../../services';

/**
 * GET /_monitor/admin/errors
 * List error groups with filters
 */
export const listErrors = route.get('/_monitor/admin/errors')
    .input({
        query: Type.Object({
            status: Type.Optional(Type.String({ description: 'Filter by status (active/resolved/ignored)' })),
            path: Type.Optional(Type.String({ description: 'Filter by request path' })),
            search: Type.Optional(Type.String({ description: 'Search in name, message, path' })),
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

        return await errorGroupsRepository.findMany({
            status: query.status as any,
            path: query.path,
            search: query.search,
            dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
            dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
            limit: query.limit ?? 20,
            offset: query.offset ?? 0,
        });
    });

/**
 * GET /_monitor/admin/errors/:id
 * Get error group detail with recent events
 */
export const getErrorDetail = route.get('/_monitor/admin/errors/:id')
    .input({
        params: Type.Object({
            id: Type.Number({ description: 'Error group ID' }),
        }),
    })
    .use([authenticate, requireRole('superadmin')])
    .handler(async (c) =>
    {
        const { params } = await c.data();

        const group = await errorGroupsRepository.findById(params.id);
        if (!group)
        {
            throw new Error(`Error group ${params.id} not found`);
        }

        const events = await errorEventsRepository.findByGroupId(params.id, { limit: 20 });

        return { group, events };
    });

/**
 * PATCH /_monitor/admin/errors/:id
 * Update error group status (resolve/ignore/reopen)
 */
export const updateErrorStatus = route.patch('/_monitor/admin/errors/:id')
    .input({
        params: Type.Object({
            id: Type.Number({ description: 'Error group ID' }),
        }),
        body: Type.Object({
            status: Type.String({ description: 'New status (active/resolved/ignored)' }),
        }),
    })
    .use([authenticate, requireRole('superadmin')])
    .handler(async (c) =>
    {
        const { params, body } = await c.data();

        return await updateErrorGroupStatus(params.id, body.status as any);
    });

/**
 * GET /_monitor/admin/errors/:id/events
 * List events for a specific error group (pagination)
 */
export const listErrorEvents = route.get('/_monitor/admin/errors/:id/events')
    .input({
        params: Type.Object({
            id: Type.Number({ description: 'Error group ID' }),
        }),
        query: Type.Object({
            limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
            offset: Type.Optional(Type.Number({ minimum: 0 })),
        }),
    })
    .use([authenticate, requireRole('superadmin')])
    .handler(async (c) =>
    {
        const { params, query } = await c.data();

        return await errorEventsRepository.findByGroupId(params.id, {
            limit: query.limit ?? 20,
            offset: query.offset ?? 0,
        });
    });
