/**
 * Universal API Client
 *
 * Automatically routes requests based on execution environment:
 * - Server Environment: Direct call to SPFN API (internal network)
 * - Browser Environment: Proxies through Next.js API Route (cookie forwarding)
 */

import type { RouteContract, InferContract } from '../route';
import { ContractClient, type CallOptions, ApiClientError } from './contract-client';

// Type declaration for window (available in browser)
declare const window: unknown | undefined;

/**
 * Detect if code is running in server environment
 *
 * Uses typeof window check for reliable browser detection
 */
function isServerEnvironment(): boolean
{
    return typeof window === 'undefined';
}

/**
 * Request interceptor function
 *
 * Called before each request to modify headers dynamically
 * Useful for adding authentication tokens, session data, etc.
 *
 * @param headers - Current request headers (mutable)
 * @param contract - Route contract being called
 * @returns Modified headers or void (modify in place)
 */
export type RequestInterceptor = (
    headers: Record<string, string>,
    contract: RouteContract
) => Promise<void> | void;

/**
 * Universal Client Configuration
 */
export interface UniversalClientConfig
{
    /**
     * SPFN API server URL (for server-side direct calls)
     *
     * @default process.env.SERVER_API_URL || process.env.SPFN_API_URL || 'http://localhost:8790'
     */
    apiUrl?: string;

    /**
     * Next.js API route base path (for client-side proxy calls)
     *
     * @default '/api/actions'
     * @example '/api/proxy'
     */
    proxyBasePath?: string;

    /**
     * Additional headers to include in all requests
     */
    headers?: Record<string, string>;

    /**
     * Request timeout in milliseconds
     *
     * @default 30000
     */
    timeout?: number;

    /**
     * Custom fetch implementation
     */
    fetch?: typeof fetch;
}

/**
 * Universal API Client
 *
 * Automatically detects execution environment and routes requests accordingly:
 *
 * **Server Environment** (Next.js Server Components, API Routes):
 * - Direct HTTP call to SPFN API server
 * - Uses internal network (e.g., http://localhost:8790)
 * - No proxy overhead
 *
 * **Browser Environment** (Next.js Client Components):
 * - Routes through Next.js API Route proxy (e.g., /api/proxy/*)
 * - Enables HttpOnly cookie forwarding
 * - Maintains CORS security
 *
 * @example
 * ```typescript
 * // Server Component - direct call
 * import { createUniversalClient } from '@spfn/core/client';
 * const client = createUniversalClient();
 * const result = await client.call(loginContract, { body: {...} });
 *
 * // Client Component - proxied call (automatic)
 * 'use client';
 * const client = createUniversalClient();
 * const result = await client.call(loginContract, { body: {...} }); // Goes through /api/proxy
 * ```
 */
export class UniversalClient
{
    private readonly directClient: ContractClient;
    private readonly proxyBasePath: string;
    private readonly isServer: boolean;
    private readonly fetchImpl: typeof fetch;

    constructor(config: UniversalClientConfig = {})
    {
        // Detect environment once during construction
        this.isServer = isServerEnvironment();

        // Direct client for server-side calls
        this.directClient = new ContractClient({
            baseUrl: config.apiUrl,
            headers: config.headers,
            timeout: config.timeout,
            fetch: config.fetch,
        });

        // Proxy configuration for client-side calls
        this.proxyBasePath = config.proxyBasePath || '/api/actions';

        // Fetch implementation
        this.fetchImpl = config.fetch || globalThis.fetch.bind(globalThis);
    }

    /**
     * Make a type-safe API call using a contract
     *
     * Automatically routes based on environment:
     * - Server: Direct SPFN API call
     * - Browser: Next.js API Route proxy
     *
     * @param contract - Route contract with absolute path
     * @param options - Call options (params, query, body, headers)
     */
    async call<TContract extends RouteContract>(
        contract: TContract,
        options?: CallOptions<TContract>
    ): Promise<InferContract<TContract>['response']>
    {
        if (this.isServer)
        {
            // Server environment: Direct call to SPFN API
            return this.directClient.call(contract, options);
        }
        else
        {
            // Browser environment: Proxy through Next.js API Route
            return this.callViaProxy(contract, options);
        }
    }

    /**
     * Call via Next.js API Route proxy (client-side)
     *
     * Routes request through /api/proxy/[...path] to enable:
     * - HttpOnly cookie forwarding
     * - CORS security
     * - Server-side session management
     *
     * @private
     */
    private async callViaProxy<TContract extends RouteContract>(
        contract: TContract,
        options?: CallOptions<TContract>
    ): Promise<InferContract<TContract>['response']>
    {
        // Build proxy URL: /api/proxy + contract.path
        // Example: /_auth/login -> /api/proxy/_auth/login
        const path = this.buildUrlPath(
            contract.path,
            options?.params as Record<string, string | number> | undefined
        );
        const queryString = this.buildQueryString(
            options?.query as Record<string, string | string[] | number | boolean> | undefined
        );
        const proxyUrl = `${this.proxyBasePath}${path}${queryString}`;

        const method = this.getHttpMethod(contract, options);

        const headers: Record<string, string> = {
            ...options?.headers,
        };

        const isFormData = this.isFormData(options?.body);

        // Set Content-Type for JSON bodies
        if (options?.body !== undefined && !isFormData && !headers['Content-Type'])
        {
            headers['Content-Type'] = 'application/json';
        }

        const init: RequestInit = {
            method,
            headers,
            credentials: 'include', // Important: Include cookies for session
            ...options?.fetchOptions, // Spread environment-specific options (e.g., Next.js cache/next)
        };

        // Add body for POST/PUT/PATCH
        if (options?.body !== undefined)
        {
            init.body = isFormData
                ? (options.body as FormData)
                : JSON.stringify(options.body);
        }

        const response = await this.fetchImpl(proxyUrl, init);

        if (!response.ok)
        {
            const errorBody = await response.json().catch(() => null);
            throw new ApiClientError(
                `${method} ${path} failed: ${response.status} ${response.statusText}`,
                response.status,
                proxyUrl,
                errorBody,
                'http'
            );
        }

        const data = await response.json();
        return data as InferContract<TContract>['response'];
    }

    /**
     * Build URL path with parameter substitution
     */
    private buildUrlPath(
        path: string,
        params?: Record<string, string | number>
    ): string
    {
        if (!params) return path;

        let url = path;
        for (const [key, value] of Object.entries(params))
        {
            url = url.replace(`:${key}`, String(value));
        }

        return url;
    }

    /**
     * Build query string from query parameters
     */
    private buildQueryString(
        query?: Record<string, string | string[] | number | boolean>
    ): string
    {
        if (!query || Object.keys(query).length === 0) return '';

        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(query))
        {
            if (Array.isArray(value))
            {
                value.forEach((v) => params.append(key, String(v)));
            }
            else if (value !== undefined && value !== null)
            {
                params.append(key, String(value));
            }
        }

        const queryString = params.toString();
        return queryString ? `?${queryString}` : '';
    }

    /**
     * Get HTTP method from contract or infer from options
     */
    private getHttpMethod<TContract extends RouteContract>(
        contract: TContract,
        options?: CallOptions<TContract>
    ): string
    {
        if ('method' in contract && typeof contract.method === 'string')
        {
            return contract.method.toUpperCase();
        }

        if (options?.body !== undefined)
        {
            return 'POST';
        }

        return 'GET';
    }

    /**
     * Check if body is FormData
     */
    private isFormData(body: unknown): body is FormData
    {
        return typeof FormData !== 'undefined' && body instanceof FormData;
    }

    /**
     * Check if currently running in server environment
     */
    isServerEnv(): boolean
    {
        return this.isServer;
    }

    /**
     * Create a new client with merged configuration
     */
    withConfig(config: Partial<UniversalClientConfig>): UniversalClient
    {
        return new UniversalClient({
            apiUrl: config.apiUrl || this.directClient['config'].baseUrl,
            proxyBasePath: config.proxyBasePath || this.proxyBasePath,
            headers: {
                ...this.directClient['config'].headers,
                ...config.headers,
            },
            timeout: config.timeout || this.directClient['config'].timeout,
            fetch: config.fetch || this.fetchImpl,
        });
    }
}

/**
 * Create a new universal API client
 *
 * @example
 * ```typescript
 * // Default configuration
 * const client = createUniversalClient();
 *
 * // Custom configuration
 * const client = createUniversalClient({
 *   apiUrl: 'http://localhost:4000',
 *   proxyBasePath: '/api/spfn',
 *   headers: { 'X-App-Version': '1.0.0' },
 * });
 * ```
 */
export function createUniversalClient(config?: UniversalClientConfig): UniversalClient
{
    return new UniversalClient(config);
}

/**
 * Global universal client singleton instance
 */
let _universalClientInstance: UniversalClient | null = null;

/**
 * Configure the global universal client instance
 *
 * Call this in your app initialization to set default configuration
 * for all auto-generated API calls.
 *
 * @example
 * ```typescript
 * // In app initialization (layout.tsx, _app.tsx, etc)
 * import { configureUniversalClient } from '@spfn/core/client';
 *
 * configureUniversalClient({
 *   apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8790',
 *   proxyBasePath: '/api/proxy',
 *   headers: {
 *     'X-App-Version': '1.0.0'
 *   }
 * });
 * ```
 */
export function configureUniversalClient(config: UniversalClientConfig): void
{
    _universalClientInstance = new UniversalClient(config);
}

/**
 * Get the global universal client instance
 *
 * Creates a default instance if not configured
 */
export function getUniversalClient(): UniversalClient
{
    if (!_universalClientInstance)
    {
        _universalClientInstance = new UniversalClient();
    }

    return _universalClientInstance;
}

/**
 * Global universal client singleton with Proxy
 *
 * This client can be configured using configureUniversalClient() before use.
 * Used by auto-generated API client code.
 */
export const universalClient = new Proxy({} as UniversalClient, {
    get(_target, prop)
    {
        const instance = getUniversalClient();
        return instance[prop as keyof UniversalClient];
    }
});