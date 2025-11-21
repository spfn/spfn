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
 * // Append errors (chainable)
 * registry
 *     .append(ValidationError)
 *     .append([PaymentFailedError, RefundError])
 *     .append(CustomError);
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
     * Append error class(es) to the registry
     *
     * @param ErrorClass - Single error constructor
     * @returns This registry for chaining
     */
    append(ErrorClass: SerializableErrorConstructor): this;

    /**
     * Append error class(es) to the registry
     *
     * @param ErrorClasses - Array of error constructors
     * @returns This registry for chaining
     */
    append(ErrorClasses: SerializableErrorConstructor[]): this;

    /**
     * Append error class(es) to the registry
     *
     * @param input - Error constructor or array of constructors
     * @returns This registry for chaining
     */
    append(input: SerializableErrorConstructor | SerializableErrorConstructor[]): this
    {
        if (Array.isArray(input))
        {
            for (const ErrorClass of input)
            {
                this.errors.set(ErrorClass.name, ErrorClass);
            }
        }
        else
        {
            this.errors.set(input.name, input);
        }

        return this;
    }

    /**
     * Concatenate another ErrorRegistry into this one
     *
     * @param registry - Another ErrorRegistry to merge
     * @returns This registry for chaining
     */
    concat(registry: ErrorRegistry): this
    {
        for (const [name, ErrorClass] of registry.errors)
        {
            this.errors.set(name, ErrorClass);
        }

        return this;
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