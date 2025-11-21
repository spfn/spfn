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

import type { RouteContract, InferContract } from '../../route/types';
import { ContractClient, type CallOptions, type RequestInterceptor } from '../contract-client';
import { logger } from "../../logger";

// Type declaration for window (available in browser)
declare const window: unknown | undefined;

const nextjsClientLogger = logger.child('@spfn/core:nextjs-client');

/**
 * Create an interceptor that forwards cookies in server-side environment
 *
 * In Next.js Server Components, cookies need to be manually forwarded
 * from the incoming request to outgoing API calls.
 */
function createCookieForwardingInterceptor(): RequestInterceptor
{
    return async (_url: string, init: RequestInit): Promise<RequestInit> =>
    {
        const isServer = typeof window === 'undefined';

        if (!isServer)
        {
            // Client-side: browser handles cookies automatically
            return init;
        }

        // Server-side: manually forward cookies
        try
        {
            // Dynamic import to avoid issues in client-side
            const { cookies } = await import('next/headers');
            const cookieStore = await cookies();
            const cookieHeader = cookieStore
                .getAll()
                .map(cookie => `${cookie.name}=${cookie.value}`)
                .join('; ');

            if (cookieHeader)
            {
                nextjsClientLogger.debug('Server-side: Forwarding cookies to API Route');

                return {
                    ...init,
                    headers: {
                        ...init.headers,
                        'Cookie': cookieHeader,
                    },
                };
            }
            else
            {
                nextjsClientLogger.debug('Server-side: No cookies to forward');
            }
        }
        catch (error)
        {
            nextjsClientLogger.warn('Failed to get cookies in server environment:', {
                error: error instanceof Error ? error.message : String(error)
            });
        }

        return init;
    };
}

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
 * import { createNextjsClient } from '@spfn/core/nextjs';
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

        nextjsClientLogger.debug('Constructor - Environment:', {
            isServer,
            configBaseUrl: config.baseUrl,
            SPFN_APP_URL: process.env.SPFN_APP_URL,
            proxyBasePath: this.proxyBasePath,
        });

        if (config.baseUrl)
        {
            this.baseUrl = config.baseUrl;
            nextjsClientLogger.debug(`Using config.baseUrl: ${this.baseUrl}`);
        }
        else if (process.env.SPFN_APP_URL)
        {
            this.baseUrl = process.env.SPFN_APP_URL;
            nextjsClientLogger.debug(`Using SPFN_APP_URL: ${this.baseUrl}`);
        }
        else if (isServer)
        {
            // Server environment requires SPFN_APP_URL to be set
            throw new Error(
                '❌ SPFN_APP_URL environment variable is required in server environment.\n' +
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
            nextjsClientLogger.debug('Using empty baseUrl (client-side relative)');
        }

        const finalBaseUrl = this.baseUrl + this.proxyBasePath;
        nextjsClientLogger.debug(`Final baseUrl for ContractClient: ${finalBaseUrl}`);

        // Create contract client pointing to API Route
        this.contractClient = new ContractClient({
            baseUrl: finalBaseUrl,
            headers: config.headers,
            timeout: config.timeout,
            fetch: config.fetch,
        });

        // Register cookie forwarding interceptor for server-side requests
        this.contractClient.use(createCookieForwardingInterceptor());
    }

    /**
     * Make a type-safe API call using a contract
     *
     * All requests go through Next.js API Route proxy.
     * Cookies are automatically forwarded by the interceptor.
     *
     * @param contract - Route contract with absolute path
     * @param options - Call options (params, query, body, headers)
     */
    async call<TContract extends RouteContract>(
        contract: TContract,
        options?: CallOptions<TContract>
    ): Promise<InferContract<TContract>['response']>
    {
        // Ensure credentials: 'include' for cookie forwarding (client-side)
        // Note: Server-side cookie forwarding is handled by interceptor
        const finalOptions: CallOptions<TContract> = {
            ...options,
            fetchOptions: {
                credentials: 'include', // Important: Include cookies for session (client-side)
                ...options?.fetchOptions,
            },
        };

        // Route through API proxy (interceptor handles cookie forwarding)
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
 * import { configureNextjsClient } from '@spfn/core/nextjs';
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
        const value = instance[prop as keyof NextjsClient];
        return typeof value === 'function' ? value.bind(instance) : value;
    }
});