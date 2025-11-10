/**
 * Next.js API Client
 *
 * Simplified client that always routes through Next.js API Route proxy.
 * Works consistently in all Next.js environments:
 * - Server Components
 * - Client Components
 * - Server Actions
 *
 * All requests go through API Route → SPFN API, ensuring:
 * - Consistent cookie handling
 * - Unified interceptor logic
 * - Same behavior everywhere
 */

import type { RouteContract, InferContract } from '../../route';
import { ContractClient, type CallOptions } from '../contract-client';

// Type declaration for window (available in browser)
declare const window: unknown | undefined;

/**
 * Next.js Client Configuration
 */
export interface NextjsClientConfig
{
    /**
     * Next.js API route base path
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

    /**
     * Base URL for server-side API Route calls
     *
     * Only needed in Server Components/Actions when calling API routes
     *
     * @default process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'
     * @example 'https://your-domain.com'
     */
    baseUrl?: string;
}

/**
 * Next.js API Client
 *
 * Always routes through Next.js API Route proxy for consistent behavior
 * across all environments.
 *
 * **Architecture:**
 * ```
 * All environments → API Route Proxy → Contract Client → SPFN API
 * ```
 *
 * @example
 * ```typescript
 * // Works everywhere (Server Components, Client Components, Server Actions)
 * import { createNextjsClient } from '@spfn/core/client/nextjs';
 *
 * const client = createNextjsClient();
 * const result = await client.call(loginContract, { body: {...} });
 * ```
 */
export class NextjsClient
{
    private readonly contractClient: ContractClient;
    private readonly proxyBasePath: string;
    private readonly baseUrl: string;

    constructor(config: NextjsClientConfig = {})
    {
        this.proxyBasePath = config.proxyBasePath || '/api/actions';

        // Determine baseUrl based on environment
        const isServer = typeof window === 'undefined';

        if (config.baseUrl)
        {
            this.baseUrl = config.baseUrl;
        }
        else if (process.env.SPFN_APP_URL)
        {
            this.baseUrl = process.env.SPFN_APP_URL;
        }
        else if (isServer)
        {
            // Server environment requires SPFN_APP_URL to be set
            throw new Error(
                '[NextjsClient] SPFN_APP_URL environment variable is required in server environment.\n' +
                'Please set SPFN_APP_URL in your .env file:\n' +
                '  SPFN_APP_URL=http://localhost:3000\n' +
                'Or configure the client with baseUrl:\n' +
                '  createNextjsClient({ baseUrl: "http://localhost:3000" })'
            );
        }
        else
        {
            // Client environment: use relative path
            this.baseUrl = '';
        }

        // Create contract client pointing to API Route
        this.contractClient = new ContractClient({
            baseUrl: this.baseUrl + this.proxyBasePath,
            headers: config.headers,
            timeout: config.timeout,
            fetch: config.fetch,
        });
    }

    /**
     * Make a type-safe API call using a contract
     *
     * All requests go through Next.js API Route proxy.
     *
     * @param contract - Route contract with absolute path
     * @param options - Call options (params, query, body, headers)
     */
    async call<TContract extends RouteContract>(
        contract: TContract,
        options?: CallOptions<TContract>
    ): Promise<InferContract<TContract>['response']>
    {
        // Ensure credentials: 'include' for cookie forwarding
        const finalOptions: CallOptions<TContract> = {
            ...options,
            fetchOptions: {
                credentials: 'include', // Important: Include cookies for session
                ...options?.fetchOptions,
            },
        };

        // Route through API proxy
        return this.contractClient.call(contract, finalOptions);
    }

    /**
     * Create a new client with merged configuration
     */
    withConfig(config: Partial<NextjsClientConfig>): NextjsClient
    {
        return new NextjsClient({
            baseUrl: config.baseUrl || this.baseUrl,
            proxyBasePath: config.proxyBasePath || this.proxyBasePath,
            headers: {
                ...this.contractClient['config'].headers,
                ...config.headers,
            },
            timeout: config.timeout || this.contractClient['config'].timeout,
            fetch: config.fetch || this.contractClient['config'].fetch,
        });
    }
}

/**
 * Create a new Next.js API client
 *
 * @example
 * ```typescript
 * // Default configuration
 * const client = createNextjsClient();
 *
 * // Custom configuration
 * const client = createNextjsClient({
 *   baseUrl: 'https://your-domain.com',
 *   proxyBasePath: '/api/spfn',
 *   headers: { 'X-App-Version': '1.0.0' },
 * });
 * ```
 */
export function createNextjsClient(config?: NextjsClientConfig): NextjsClient
{
    return new NextjsClient(config);
}

/**
 * Global Next.js client singleton instance
 */
let _nextjsClientInstance: NextjsClient | null = null;

/**
 * Configure the global Next.js client instance
 *
 * Call this in your app initialization to set default configuration
 * for all auto-generated API calls.
 *
 * @example
 * ```typescript
 * // In app initialization (layout.tsx, _app.tsx, etc)
 * import { configureNextjsClient } from '@spfn/core/client/nextjs';
 *
 * configureNextjsClient({
 *   baseUrl: process.env.NEXT_PUBLIC_URL || 'http://localhost:3000',
 *   proxyBasePath: '/api/actions',
 *   headers: {
 *     'X-App-Version': '1.0.0'
 *   }
 * });
 * ```
 */
export function configureNextjsClient(config: NextjsClientConfig): void
{
    _nextjsClientInstance = new NextjsClient(config);
}

/**
 * Get the global Next.js client instance
 *
 * Creates a default instance if not configured
 */
export function getNextjsClient(): NextjsClient
{
    if (!_nextjsClientInstance)
    {
        _nextjsClientInstance = new NextjsClient();
    }

    return _nextjsClientInstance;
}

/**
 * Global Next.js client singleton with Proxy
 *
 * This client can be configured using configureNextjsClient() before use.
 * Used by auto-generated API client code.
 */
export const nextjsClient = new Proxy({} as NextjsClient, {
    get(_target, prop)
    {
        const instance = getNextjsClient();
        return instance[prop as keyof NextjsClient];
    }
});