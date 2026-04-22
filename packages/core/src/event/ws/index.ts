/**
 * WebSocket Module
 *
 * Type-safe WebSocket server with event-based pub/sub and bidirectional messaging.
 *
 * @example Server setup
 * ```typescript
 * // src/server/ws.ts
 * import { defineWSRouter } from '@spfn/core/event/ws';
 * import { defineEvent } from '@spfn/core/event';
 * import { Type } from '@sinclair/typebox';
 *
 * const userUpdated = defineEvent('user.updated', Type.Object({ userId: Type.String() }));
 * const notification = defineEvent('notification', Type.Object({ message: Type.String() }));
 *
 * export const wsRouter = defineWSRouter({
 *     events: { userUpdated, notification },
 *     messages: {
 *         ping: ({ ws }) => ws.send('pong', {}),
 *     },
 * });
 *
 * export type WSRouter = typeof wsRouter;
 *
 * // server.config.ts
 * defineServerConfig()
 *     .websockets(wsRouter)
 *     .build();
 * ```
 *
 * @example Client usage
 * ```typescript
 * import { createWSClient } from '@spfn/core/event/ws/client';
 * import type { WSRouter } from '@/server/ws';
 *
 * const client = createWSClient<WSRouter>();
 *
 * client.subscribe({
 *     events: ['userUpdated', 'notification'],
 *     handlers: {
 *         userUpdated: ({ userId }) => console.log(userId),
 *         notification: ({ message }) => console.log(message),
 *     },
 * });
 *
 * client.send('ping', {});
 * ```
 */

import type { EventDef } from '../types';
import type { WSRouterDef, WSMessageHandlers } from './types';

export { attachWSHandler } from './handler';
export type {
    WSRouterDef,
    WSHandlerConfig,
    WSAuthConfig,
    WSHandlerAuthConfig,
    WSMessageContext,
    WSMessageHandlerFn,
    WSMessageHandlers,
    WSRawConnection,
    WSClientConfig,
    WSConnectionState,
    WSEventHandlers,
    WSSubscribeOptions,
    WSUnsubscribe,
} from './types';

/**
 * Define a WebSocket router
 *
 * Combines server→client event push with client→server message handlers.
 *
 * @example
 * ```typescript
 * export const wsRouter = defineWSRouter({
 *     events: { userUpdated, notification },
 *     messages: {
 *         ping: ({ ws }) => ws.send('pong', {}),
 *         'chat.send': ({ payload, subject }) => handleChat(payload, subject),
 *     },
 * });
 * ```
 */
export function defineWSRouter<
    TEvents extends Record<string, EventDef<any>>,
    TMessages extends WSMessageHandlers = WSMessageHandlers
>(def: {
    events: TEvents;
    messages?: TMessages;
}): WSRouterDef<TEvents, TMessages>
{
    return {
        events: def.events,
        eventNames: Object.keys(def.events) as (keyof TEvents)[],
        messages: (def.messages ?? {}) as TMessages,
        _types: {} as WSRouterDef<TEvents, TMessages>['_types'],
    };
}
