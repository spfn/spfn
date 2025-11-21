/**
 * Serializable Error Base Class
 *
 * Base class for errors that can be serialized/deserialized across HTTP boundary.
 * Automatically serializes public fields for transmission to client.
 */

/**
 * Base class for all serializable errors
 *
 * Features:
 * - Auto-serialization of public fields via toJSON()
 * - Constructor accepts object with all fields
 * - Type-safe error handling with instanceof
 *
 * @example
 * ```typescript
 * class PaymentFailedError extends SerializableError
 * {
 *     readonly statusCode = 402;
 *     transactionId!: string;
 *     reason!: 'insufficient_funds' | 'card_declined';
 *
 *     constructor(data: {
 *         message: string;
 *         transactionId: string;
 *         reason: 'insufficient_funds' | 'card_declined';
 *     })
 *     {
 *         super(data.message);
 *         this.name = 'PaymentFailedError';
 *         Object.assign(this, data);
 *     }
 * }
 * ```
 */
export abstract class SerializableError extends Error
{
    /**
     * HTTP status code for this error type
     */
    abstract readonly statusCode: number;

    /**
     * Serialize error to JSON-compatible object
     *
     * Automatically includes:
     * - __type: Constructor name for deserialization
     * - message: Error message
     * - All public instance properties (except name, stack)
     */
    toJSON(): Record<string, any>
    {
        const json: Record<string, any> = {
            __type: this.constructor.name,
            message: this.message,
        };

        // Extract all public instance properties
        for (const key of Object.keys(this))
        {
            // Skip Error built-ins and statusCode (inferred from type)
            if (key !== 'name' && key !== 'message' && key !== 'stack' && key !== 'statusCode')
            {
                json[key] = (this as any)[key];
            }
        }

        return json;
    }
}
