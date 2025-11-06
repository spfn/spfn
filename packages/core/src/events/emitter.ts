/**
 * Event Emitter
 *
 * Adapter-based event emitter for decoupled communication between packages.
 *
 * Default adapter: InMemoryEventEmitter (single-instance)
 *
 * @example
 * ```typescript
 * // Subscribe to events
 * import { on } from '@spfn/core/events';
 *
 * on('user:created', async (data) => {
 *   console.log('User created:', data.email);
 * });
 *
 * // Emit events
 * import { emit } from '@spfn/core/events';
 *
 * await emit('user:created', {
 *   userId: '123',
 *   email: 'user@example.com'
 * });
 *
 * // Switch to Redis adapter (multi-instance)
 * import { setEventEmitter } from '@spfn/core/events';
 * import { RedisEventEmitter } from '@spfn/core/events/adapters';
 *
 * setEventEmitter(new RedisEventEmitter({
 *   host: 'localhost',
 *   port: 6379
 * }));
 * ```
 */

import type { EventEmitter, EventHandler } from './types';
import { InMemoryEventEmitter } from './adapters/memory';

let emitter: EventEmitter = new InMemoryEventEmitter();

/**
 * Set the event emitter adapter
 *
 * @param adapter - EventEmitter adapter implementation
 *
 * @example
 * ```typescript
 * import { setEventEmitter } from '@spfn/core/events';
 * import { InMemoryEventEmitter } from '@spfn/core/events/adapters';
 *
 * setEventEmitter(new InMemoryEventEmitter());
 * ```
 */
export function setEventEmitter(adapter: EventEmitter): void
{
    emitter = adapter;
}

/**
 * Get the current event emitter adapter
 *
 * @returns Current EventEmitter instance
 */
export function getEventEmitter(): EventEmitter
{
    return emitter;
}

/**
 * Subscribe to an event
 *
 * @param event - Event name
 * @param handler - Event handler function
 *
 * @example
 * ```typescript
 * on('user:created', async (data) => {
 *   console.log('User created:', data.email);
 * });
 * ```
 */
export function on(event: string, handler: EventHandler): void
{
    emitter.on(event, handler);
}

/**
 * Emit an event
 *
 * @param event - Event name
 * @param data - Event data
 *
 * @example
 * ```typescript
 * await emit('user:created', {
 *   userId: '123',
 *   email: 'user@example.com'
 * });
 * ```
 */
export async function emit(event: string, data?: any): Promise<void>
{
    await emitter.emit(event, data);
}

/**
 * Unsubscribe from an event
 *
 * @param event - Event name
 *
 * @example
 * ```typescript
 * off('user:created');
 * ```
 */
export function off(event: string): void
{
    emitter.off(event);
}

/**
 * Clear all event subscriptions
 *
 * Useful for testing or cleanup
 *
 * @example
 * ```typescript
 * // In tests
 * beforeEach(() => {
 *   clear();
 * });
 * ```
 */
export function clear(): void
{
    emitter.clear();
}