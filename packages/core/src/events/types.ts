/**
 * Event handler function type
 */
export type EventHandler<T = any> = (data: T) => Promise<void> | void;

/**
 * EventEmitter interface
 *
 * All event emitter adapters must implement this interface
 */
export interface EventEmitter
{
    /**
     * Subscribe to an event
     *
     * @param event - Event name
     * @param handler - Event handler function
     */
    on(event: string, handler: EventHandler): void;

    /**
     * Emit an event
     *
     * @param event - Event name
     * @param data - Event data
     */
    emit(event: string, data?: any): Promise<void>;

    /**
     * Unsubscribe from an event
     *
     * @param event - Event name
     */
    off(event: string): void;

    /**
     * Clear all event subscriptions
     */
    clear(): void;
}