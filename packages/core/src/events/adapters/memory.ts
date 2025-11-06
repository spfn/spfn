/**
 * In-Memory Event Emitter
 *
 * Simple in-process event emitter for single-instance deployments.
 * Events are not shared across multiple server instances.
 *
 * Use this adapter for:
 * - Development
 * - Single-instance production deployments
 * - When you don't need distributed events
 *
 * @example
 * ```typescript
 * import { setEventEmitter } from '@spfn/core/events';
 * import { InMemoryEventEmitter } from '@spfn/core/events/adapters';
 *
 * setEventEmitter(new InMemoryEventEmitter());
 * ```
 */

import type { EventEmitter, EventHandler } from '../types';

export class InMemoryEventEmitter implements EventEmitter
{
    private listeners = new Map<string, EventHandler[]>();

    on(event: string, handler: EventHandler): void
    {
        if (!this.listeners.has(event))
        {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(handler);
    }

    async emit(event: string, data?: any): Promise<void>
    {
        const handlers = this.listeners.get(event) || [];

        if (handlers.length === 0)
        {
            return;
        }

        // Execute all handlers in parallel
        // Failures in individual handlers don't affect others
        const results = await Promise.allSettled(
            handlers.map(async (handler) =>
            {
                try
                {
                    return await handler(data);
                }
                catch (error)
                {
                    // Catch and re-throw for Promise.allSettled
                    throw error;
                }
            })
        );

        // Log failed handlers for debugging
        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length > 0)
        {
            console.error(
                `[Events] ${failed.length}/${handlers.length} handlers failed for event "${event}"`,
                {
                    errors: failed.map(r => (r as PromiseRejectedResult).reason),
                }
            );
        }
    }

    off(event: string): void
    {
        this.listeners.delete(event);
    }

    clear(): void
    {
        this.listeners.clear();
    }

    /**
     * Get list of registered events (for debugging)
     */
    getEvents(): string[]
    {
        return Array.from(this.listeners.keys());
    }

    /**
     * Get number of handlers for an event (for debugging)
     */
    getHandlerCount(event: string): number
    {
        return this.listeners.get(event)?.length || 0;
    }
}