// ============================================================================
// Client Error
// ============================================================================

/**
 * Typed client error
 */
export class ApiError extends Error
{
    constructor(
        message: string,
        public readonly status: number,
        public readonly url: string,
        public readonly response?: unknown,
        public readonly errorType?: 'http' | 'network' | 'timeout',
    )
    {
        super(message);
        this.name = 'ApiError';
    }
}
