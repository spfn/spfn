/**
 * Server-time wire capability.
 *
 * The value is a server-runtime fact. Authentication packages may consume the
 * contract, but skew policy, replay windows and client persistence do not
 * belong here.
 */

import { Type, type Static } from '@sinclair/typebox';

import { defineRouter, route } from '../route';
import { CORE_TIME_PATH } from './namespace';

/** Stable operation identity used by separately deployed clients. */
export const CORE_TIME_OPERATION_ID = 'core.time';

/**
 * Closed response shape for the server-time wire capability.
 *
 * Millisecond timestamps use integers throughout SPFN's external contracts.
 */
export const ServerTimeResponseSchema = Type.Object({
    serverTimeMillis: Type.Integer(),
}, { additionalProperties: false });

export type ServerTimeResponse = Static<typeof ServerTimeResponseSchema>;

/** Injectable source of Unix epoch milliseconds. */
export interface ServerClock
{
    now(): number;
}

const systemServerClock: ServerClock = {
    now: () => Date.now(),
};

/**
 * Build the route from a clock so tests and alternate runtimes can supply the
 * epoch source without replacing global time.
 */
export function createCoreTimeRoute(clock: ServerClock = systemServerClock)
{
    return route.get(CORE_TIME_PATH)
        .skip('*')
        .contract({
            since: '0.3.0',
            auth: 'none',
            requiresSession: false,
            response: ServerTimeResponseSchema,
        })
        .handler(async (c) =>
        {
            const response = {
                serverTimeMillis: clock.now(),
            } satisfies ServerTimeResponse;

            c.raw.header('Cache-Control', 'no-store');

            return response;
        });
}

/** The production route and the public wire-contract source of truth. */
export const CORE_TIME_ROUTE = createCoreTimeRoute();

/** Build the internal router used by the server registration path. */
export function createCoreTimeRouter(clock?: ServerClock)
{
    return defineRouter({
        [CORE_TIME_OPERATION_ID]: createCoreTimeRoute(clock),
    });
}
