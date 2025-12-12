/**
 * Event Router
 *
 * Type-safe event router for SSE subscription
 *
 * @example
 * ```typescript
 * import { defineEvent, defineEventRouter } from '@spfn/core/event';
 * import { Type } from '@sinclair/typebox';
 *
 * const userCreated = defineEvent('user.created', Type.Object({
 *     userId: Type.String(),
 * }));
 *
 * const orderPlaced = defineEvent('order.placed', Type.Object({
 *     orderId: Type.String(),
 *     amount: Type.Number(),
 * }));
 *
 * export const eventRouter = defineEventRouter({
 *     userCreated,
 *     orderPlaced,
 * });
 *
 * export type EventRouter = typeof eventRouter;
 * ```
 */

import type { EventDef } from './types';

/**
 * Event Router Definition
 */
export interface EventRouterDef<TEvents extends Record<string, EventDef<any>>>
{
    /**
     * Event definitions
     */
    readonly events: TEvents;

    /**
     * Event names as array
     */
    readonly eventNames: (keyof TEvents)[];

    /**
     * Type inference helper - payload types by event name
     */
    readonly _types: {
        [K in keyof TEvents]: TEvents[K]['_payload'];
    };
}

/**
 * Infer event names from EventRouter
 */
export type InferEventNames<T> = T extends EventRouterDef<infer E>
    ? keyof E & string
    : never;

/**
 * Infer payload type for specific event
 */
export type InferEventPayload<
    T extends EventRouterDef<any>,
    K extends InferEventNames<T>
> = T['_types'][K];

/**
 * Infer all event payloads map
 */
export type InferEventPayloads<T extends EventRouterDef<any>> = T['_types'];

/**
 * Define an event router for SSE subscription
 *
 * @example
 * ```typescript
 * export const eventRouter = defineEventRouter({
 *     userCreated,
 *     orderPlaced,
 * });
 *
 * // Type inference
 * type Names = InferEventNames<typeof eventRouter>;
 * // 'userCreated' | 'orderPlaced'
 *
 * type Payload = InferEventPayload<typeof eventRouter, 'userCreated'>;
 * // { userId: string }
 * ```
 */
export function defineEventRouter<
    TEvents extends Record<string, EventDef<any>>
>(events: TEvents): EventRouterDef<TEvents>
{
    return {
        events,
        eventNames: Object.keys(events) as (keyof TEvents)[],
        _types: {} as EventRouterDef<TEvents>['_types'],
    };
}