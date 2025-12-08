/**
 * Event Module
 *
 * Decoupled pub/sub event system with optional cache integration
 *
 * @example
 * ```typescript
 * import { defineEvent } from '@spfn/core/event';
 * import { Type } from '@sinclair/typebox';
 *
 * // Define event with payload
 * export const userCreated = defineEvent('user.created', Type.Object({
 *     userId: Type.String(),
 * }));
 *
 * // Subscribe to event (in-memory)
 * userCreated.subscribe((payload) => {
 *     console.log('User created:', payload.userId);
 * });
 *
 * // Emit event
 * await userCreated.emit({ userId: '123' });
 *
 * // Multi-instance with cache (Redis pub/sub)
 * await userCreated.useCache(pubSubCache);
 * await userCreated.emit({ userId: '123' });  // All instances receive
 * ```
 */

export { defineEvent } from './event';
export type {
    EventDef,
    EventHandler,
    InferEventPayload,
    PubSubCache,
    JobQueueSender,
} from './types';
