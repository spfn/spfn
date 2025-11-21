/**
 * Error Registry
 *
 * Central registry for serializable error types.
 * Enables automatic error deserialization on the client side.
 */

import type { SerializableError } from './serializable-error';

/**
 * Error constructor type
 */
export type SerializableErrorConstructor = new (data: any) => SerializableError;

/**
 * Error registry for serialization/deserialization
 *
 * @example
 * ```typescript
 * // Create registry
 * const registry = new ErrorRegistry();
 *
 * // Register errors
 * registry.register(ValidationError);
 * registry.register(PaymentFailedError);
 *
 * // Deserialize from JSON
 * const error = registry.deserialize({
 *     __type: 'PaymentFailedError',
 *     message: 'Payment failed',
 *     transactionId: 'tx_123',
 *     reason: 'insufficient_funds'
 * });
 *
 * // error instanceof PaymentFailedError === true
 * ```
 */
export class ErrorRegistry
{
    private errors = new Map<string, SerializableErrorConstructor>();

    /**
     * Register an error class
     *
     * @param ErrorClass - Error constructor to register
     */
    register(ErrorClass: SerializableErrorConstructor): void
    {
        this.errors.set(ErrorClass.name, ErrorClass);
    }

    /**
     * Register multiple error classes
     *
     * @param ErrorClasses - Array of error constructors
     */
    registerAll(ErrorClasses: SerializableErrorConstructor[]): void
    {
        for (const ErrorClass of ErrorClasses)
        {
            this.register(ErrorClass);
        }
    }

    /**
     * Check if error type is registered
     *
     * @param name - Error class name
     */
    has(name: string): boolean
    {
        return this.errors.has(name);
    }

    /**
     * Deserialize error from JSON data
     *
     * @param data - Serialized error data with __type field
     * @returns Deserialized error instance
     * @throws Error if error type is not registered
     */
    deserialize(data: { __type: string; [key: string]: any }): SerializableError
    {
        const ErrorClass = this.errors.get(data.__type);

        if (!ErrorClass)
        {
            throw new Error(`Unknown error type: ${data.__type}`);
        }

        // Pass entire data object to constructor
        return new ErrorClass(data);
    }

    /**
     * Try to deserialize error, return null if type unknown
     *
     * @param data - Serialized error data
     * @returns Deserialized error or null
     */
    tryDeserialize(data: { __type?: string; [key: string]: any }): SerializableError | null
    {
        if (!data.__type || !this.has(data.__type))
        {
            return null;
        }

        try
        {
            return this.deserialize(data as any);
        }
        catch
        {
            return null;
        }
    }

    /**
     * Get all registered error types
     */
    getRegisteredTypes(): string[]
    {
        return Array.from(this.errors.keys());
    }
}