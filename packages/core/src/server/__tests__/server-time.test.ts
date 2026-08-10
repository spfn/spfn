/**
 * The built-in server-time wire capability.
 *
 * Scope: the exported route contract, exact injected clock reading, no-store
 * cache policy, and the unproven/session-free registration boundary.
 */

import { Value } from '@sinclair/typebox/value';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { defineRouter, route } from '@spfn/core/route';
import { collectContractDocument } from '../../contract';
import { defineServerConfig } from '../config-builder';
import { createServer } from '../create-server';
import { CORE_TIME_PATH } from '../namespace';
import {
    CORE_TIME_OPERATION_ID,
    CORE_TIME_ROUTE,
    ServerTimeResponseSchema,
} from '../server-time';

describe('core server-time contract', () =>
{
    it('publishes one closed, unproven and session-free integer response', () =>
    {
        expect(CORE_TIME_OPERATION_ID).toBe('core.time');
        expect(CORE_TIME_ROUTE.method).toBe('GET');
        expect(CORE_TIME_ROUTE.path).toBe(CORE_TIME_PATH);
        expectTypeOf(CORE_TIME_ROUTE._response).toEqualTypeOf<{ serverTimeMillis: number }>();
        expect(CORE_TIME_ROUTE.contract).toMatchObject({
            since: '0.3.0',
            auth: 'none',
            requiresSession: false,
            response: ServerTimeResponseSchema,
        });
        expect(ServerTimeResponseSchema.additionalProperties).toBe(false);
        expect(Value.Check(ServerTimeResponseSchema, { serverTimeMillis: 1750000000123 })).toBe(true);
        expect(Value.Check(ServerTimeResponseSchema, { serverTimeMillis: 1.5 })).toBe(false);
        expect(Value.Check(ServerTimeResponseSchema, {
            serverTimeMillis: 1750000000123,
            extra: true,
        })).toBe(false);

        expect(collectContractDocument(defineRouter({
            [CORE_TIME_OPERATION_ID]: CORE_TIME_ROUTE,
        })).operations).toEqual([{
            name: 'core.time',
            method: 'GET',
            path: CORE_TIME_PATH,
            since: '0.3.0',
            auth: 'none',
            requiresSession: false,
            request: {},
            interceptor: {},
            response: {
                type: 'object',
                properties: {
                    serverTimeMillis: { type: 'integer' },
                },
                required: ['serverTimeMillis'],
                additionalProperties: false,
            },
        }]);
    });
});

describe('GET /_core/time', () =>
{
    it('returns the exact injected epoch without caching or application authentication', async () =>
    {
        const now = vi.fn(() => 1750000000123);
        const deniedByRawMiddleware = vi.fn();
        const deniedByHook = vi.fn();
        const shadow = route.get(CORE_TIME_PATH).handler(async () => ({ serverTimeMillis: 0 }));

        const config = defineServerConfig()
            .infrastructure({ database: false, redis: false })
            .serverTime({ clock: { now } })
            .proxyGuard({ mode: 'strict', secret: 'a'.repeat(48) })
            .use([async (c) =>
            {
                deniedByRawMiddleware();

                return c.json({ error: 'raw middleware denied' }, 401);
            }])
            .lifecycle({
                beforeRoutes: async (app) =>
                {
                    app.use('*', async (c) =>
                    {
                        deniedByHook();

                        return c.json({ error: 'hook denied' }, 401);
                    });
                },
            })
            .routes(defineRouter({ shadow }))
            .build();

        const app = await createServer(config);
        const response = await app.request(CORE_TIME_PATH);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(body).toEqual({ serverTimeMillis: 1750000000123 });
        expect(now).toHaveBeenCalledTimes(1);
        expect(deniedByRawMiddleware).not.toHaveBeenCalled();
        expect(deniedByHook).not.toHaveBeenCalled();
    });
});
