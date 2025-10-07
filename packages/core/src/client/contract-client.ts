/**
 * Contract-Based API Client
 *
 * Type-safe HTTP client that works with RouteContract for full end-to-end type safety
 *
 * @example
 * ```ts
 * import { createClient } from '@spfn/core/client';
 * import { getUserContract } from './contracts';
 *
 * const client = createClient({ baseUrl: 'http://localhost:4000' });
 * const user = await client.call(getUserContract, { params: { id: '123' } });
 * // ✅ user is fully typed based on contract.response
 * ```
 */

import type { RouteContract, InferContract } from '../route';

/**
 * Client configuration
 */
export interface ClientConfig {
    /**
     * API base URL (e.g., http://localhost:4000)
     * Can be overridden per request
     */
    baseUrl?: string;

    /**
     * Default headers to include in all requests
     */
    headers?: Record<string, string>;

    /**
     * Request timeout in milliseconds
     */
    timeout?: number;

    /**
     * Custom fetch implementation (for testing or custom behavior)
     */
    fetch?: typeof fetch;
}

/**
 * Request options for API calls
 */
export interface CallOptions<TContract extends RouteContract> {
    /**
     * Path parameters (for dynamic routes like /users/:id)
     */
    params?: InferContract<TContract>['params'];

    /**
     * Query parameters (for URL query strings)
     */
    query?: InferContract<TContract>['query'];

    /**
     * Request body (for POST, PUT, PATCH)
     */
    body?: InferContract<TContract>['body'];

    /**
     * Additional headers for this specific request
     */
    headers?: Record<string, string>;

    /**
     * Override base URL for this request
     */
    baseUrl?: string;
}

/**
 * API Client Error
 */
export class ApiClientError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly statusText: string,
        public readonly url: string,
        public readonly response?: unknown
    ) {
        super(message);
        this.name = 'ApiClientError';
    }
}

/**
 * Build URL with path parameters replaced
 *
 * @example
 * buildUrl('/users/:id', { id: '123' }) → '/users/123'
 * buildUrl('/posts/:postId/comments/:id', { postId: '1', id: '2' }) → '/posts/1/comments/2'
 */
function buildUrl(path: string, params?: Record<string, string | number>): string {
    if (!params) return path;

    let url = path;
    for (const [key, value] of Object.entries(params)) {
        url = url.replace(`:${key}`, String(value));
    }
    return url;
}

/**
 * Build query string from object
 *
 * @example
 * buildQuery({ page: '1', limit: '10' }) → '?page=1&limit=10'
 */
function buildQuery(query?: Record<string, string | string[] | number | boolean>): string {
    if (!query || Object.keys(query).length === 0) return '';

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (Array.isArray(value)) {
            value.forEach((v) => params.append(key, String(v)));
        } else if (value !== undefined && value !== null) {
            params.append(key, String(value));
        }
    }

    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
}

/**
 * Extract HTTP method from contract or infer from request type
 */
function getHttpMethod<TContract extends RouteContract>(
    contract: TContract,
    options?: CallOptions<TContract>
): string {
    // If contract has explicit method, use it
    if ('method' in contract && typeof contract.method === 'string') {
        return contract.method.toUpperCase();
    }

    // Infer from presence of body
    if (options?.body !== undefined) {
        return 'POST';
    }

    // Default to GET
    return 'GET';
}

/**
 * Contract-based API Client
 */
export class ContractClient {
    private readonly config: Required<ClientConfig>;

    constructor(config: ClientConfig = {}) {
        this.config = {
            baseUrl: config.baseUrl || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
            headers: config.headers || {},
            timeout: config.timeout || 30000,
            fetch: config.fetch || globalThis.fetch,
        };
    }

    /**
     * Make a type-safe API call using a contract
     *
     * @example
     * ```ts
     * const getUserContract = {
     *   params: Type.Object({ id: Type.String() }),
     *   response: Type.Object({ id: Type.Number(), name: Type.String() })
     * } as const satisfies RouteContract;
     *
     * const user = await client.call('/users/:id', getUserContract, {
     *   params: { id: '123' }
     * });
     * // ✅ user.name is typed as string
     * ```
     */
    async call<TContract extends RouteContract>(
        path: string,
        contract: TContract,
        options?: CallOptions<TContract>
    ): Promise<InferContract<TContract>['response']> {
        // Build URL
        const baseUrl = options?.baseUrl || this.config.baseUrl;
        const urlPath = buildUrl(path, options?.params as Record<string, string | number>);
        const queryString = buildQuery(options?.query as Record<string, string | string[] | number | boolean>);
        const url = `${baseUrl}${urlPath}${queryString}`;

        // Determine HTTP method
        const method = getHttpMethod(contract, options);

        // Build headers
        const headers: Record<string, string> = {
            ...this.config.headers,
            ...options?.headers,
        };

        // Add Content-Type for requests with body
        if (options?.body !== undefined && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        // Build request init
        const init: RequestInit = {
            method,
            headers,
        };

        // Add body for POST/PUT/PATCH
        if (options?.body !== undefined) {
            init.body = JSON.stringify(options.body);
        }

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
        init.signal = controller.signal;

        try {
            // Make request
            const response = await this.config.fetch(url, init);

            // Clear timeout
            clearTimeout(timeoutId);

            // Handle non-OK responses
            if (!response.ok) {
                const errorBody = await response.json().catch(() => null);
                throw new ApiClientError(
                    `${method} ${urlPath} failed: ${response.status} ${response.statusText}`,
                    response.status,
                    response.statusText,
                    url,
                    errorBody
                );
            }

            // Parse and return response
            const data = await response.json();
            return data as InferContract<TContract>['response'];
        } catch (error) {
            clearTimeout(timeoutId);

            // Re-throw ApiClientError as-is
            if (error instanceof ApiClientError) {
                throw error;
            }

            // Handle abort (timeout)
            if (error instanceof Error && error.name === 'AbortError') {
                throw new ApiClientError(
                    `${method} ${urlPath} timed out after ${this.config.timeout}ms`,
                    0,
                    'Timeout',
                    url
                );
            }

            // Handle network errors
            if (error instanceof Error) {
                throw new ApiClientError(
                    `${method} ${urlPath} network error: ${error.message}`,
                    0,
                    'Network Error',
                    url
                );
            }

            // Unknown error
            throw error;
        }
    }

    /**
     * Create a new client with merged configuration
     *
     * Useful for creating clients with specific auth tokens or custom headers
     *
     * @example
     * ```ts
     * const authClient = client.withConfig({
     *   headers: { Authorization: `Bearer ${token}` }
     * });
     * ```
     */
    withConfig(config: Partial<ClientConfig>): ContractClient {
        return new ContractClient({
            baseUrl: config.baseUrl || this.config.baseUrl,
            headers: { ...this.config.headers, ...config.headers },
            timeout: config.timeout || this.config.timeout,
            fetch: config.fetch || this.config.fetch,
        });
    }
}

/**
 * Create a new contract-based API client
 *
 * @example
 * ```ts
 * const client = createClient({
 *   baseUrl: 'http://localhost:4000',
 *   headers: { 'X-Custom': 'header' }
 * });
 *
 * const user = await client.call('/users/:id', getUserContract, {
 *   params: { id: '123' }
 * });
 * ```
 */
export function createClient(config?: ClientConfig): ContractClient {
    return new ContractClient(config);
}

/**
 * Default client instance
 *
 * @example
 * ```ts
 * import { client } from '@spfn/core/client';
 *
 * const user = await client.call('/users/:id', getUserContract, {
 *   params: { id: '123' }
 * });
 * ```
 */
export const client = createClient();