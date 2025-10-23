/**
 * Contract-Based API Client
 *
 * Type-safe HTTP client that works with RouteContract for full end-to-end type safety
 */
import type { RouteContract, InferContract } from '../route';

export type RequestInterceptor = (
    url: string,
    init: RequestInit
) => Promise<RequestInit> | RequestInit;

export interface ClientConfig
{
    /**
     * API base URL (e.g., http://localhost:4000)
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
     * Custom fetch implementation
     */
    fetch?: typeof fetch;
}

export interface CallOptions<TContract extends RouteContract>
{
    params?: InferContract<TContract>['params'];
    query?: InferContract<TContract>['query'];
    body?: InferContract<TContract>['body'];
    headers?: Record<string, string>;
    baseUrl?: string;
}

/**
 * API Client Error
 */
export class ApiClientError extends Error
{
    constructor(
        message: string,
        public readonly status: number,
        public readonly url: string,
        public readonly response?: unknown,
        public readonly errorType?: 'timeout' | 'network' | 'http'
    )
    {
        super(message);
        this.name = 'ApiClientError';
    }
}

/**
 * Contract-based API Client
 */
export class ContractClient
{
    private readonly config: Required<ClientConfig>;
    private readonly interceptors: RequestInterceptor[] = [];

    constructor(config: ClientConfig = {})
    {
        this.config = {
            baseUrl: config.baseUrl || process.env.SERVER_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
            headers: config.headers || {},
            timeout: config.timeout || 30000,
            fetch: config.fetch || globalThis.fetch.bind(globalThis),
        };
    }

    /**
     * Add request interceptor
     */
    use(interceptor: RequestInterceptor): void
    {
        this.interceptors.push(interceptor);
    }

    /**
     * Make a type-safe API call using a contract
     *
     * @param basePath - Base path from file-based routing (e.g., '/organizations')
     * @param contract - Route contract
     * @param options - Call options (params, query, body, headers)
     */
    async call<TContract extends RouteContract>(
        basePath: string,
        contract: TContract,
        options?: CallOptions<TContract>
    ): Promise<InferContract<TContract>['response']>
    {
        const baseUrl = options?.baseUrl || this.config.baseUrl;

        // Combine basePath and contract.path, handling trailing/leading slashes
        const combinedPath = ContractClient.combinePaths(basePath, contract.path);

        const urlPath = ContractClient.buildUrl(
            combinedPath,
            options?.params as Record<string, string | number> | undefined
        );
        const queryString = ContractClient.buildQuery(
            options?.query as Record<string, string | string[] | number | boolean> | undefined
        );
        const url = `${baseUrl}${urlPath}${queryString}`;

        const method = ContractClient.getHttpMethod(contract, options);

        const headers: Record<string, string> = {
            ...this.config.headers,
            ...options?.headers,
        };

        const isFormData = ContractClient.isFormData(options?.body);

        if (options?.body !== undefined && !isFormData && !headers['Content-Type'])
        {
            headers['Content-Type'] = 'application/json';
        }

        let init: RequestInit = {
            method,
            headers,
        };

        if (options?.body !== undefined)
        {
            init.body = isFormData ? (options.body as FormData) : JSON.stringify(options.body);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
        init.signal = controller.signal;

        for (const interceptor of this.interceptors)
        {
            init = await interceptor(url, init);
        }

        const response = await this.config.fetch(url, init).catch((error) =>
        {
            clearTimeout(timeoutId);

            if (error instanceof Error && error.name === 'AbortError')
            {
                throw new ApiClientError(
                    `Request timed out after ${this.config.timeout}ms`,
                    0,
                    url,
                    undefined,
                    'timeout'
                );
            }

            if (error instanceof Error)
            {
                throw new ApiClientError(
                    `Network error: ${error.message}`,
                    0,
                    url,
                    undefined,
                    'network'
                );
            }

            throw error;
        });

        clearTimeout(timeoutId);

        if (!response.ok)
        {
            const errorBody = await response.json().catch(() => null);
            throw new ApiClientError(
                `${method} ${urlPath} failed: ${response.status} ${response.statusText}`,
                response.status,
                url,
                errorBody,
                'http'
            );
        }

        const data = await response.json();
        return data as InferContract<TContract>['response'];
    }

    /**
     * Create a new client with merged configuration
     */
    withConfig(config: Partial<ClientConfig>): ContractClient
    {
        return new ContractClient({
            baseUrl: config.baseUrl || this.config.baseUrl,
            headers: { ...this.config.headers, ...config.headers },
            timeout: config.timeout || this.config.timeout,
            fetch: config.fetch || this.config.fetch,
        });
    }

    /**
     * Combine basePath and contract.path, handling trailing/leading slashes
     *
     * @example
     * combinePaths('/organizations', '/') → '/organizations'
     * combinePaths('/organizations', '/:id') → '/organizations/:id'
     * combinePaths('/', '/health') → '/health'
     */
    private static combinePaths(basePath: string, contractPath: string): string
    {
        // Remove trailing slash from basePath (unless it's root '/')
        const normalizedBase = basePath === '/' ? '' : basePath.replace(/\/$/, '');

        // Remove leading slash from contractPath
        const normalizedContract = contractPath.replace(/^\//, '');

        // If contractPath is empty or just '/', return basePath
        if (!normalizedContract || normalizedContract === '')
        {
            return basePath;
        }

        // Combine with single slash
        return `${normalizedBase}/${normalizedContract}`;
    }

    private static buildUrl(path: string, params?: Record<string, string | number>): string
    {
        if (!params) return path;

        let url = path;
        for (const [key, value] of Object.entries(params))
        {
            url = url.replace(`:${key}`, String(value));
        }

        return url;
    }

    private static buildQuery(query?: Record<string, string | string[] | number | boolean>): string
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

    private static getHttpMethod<TContract extends RouteContract>(
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

    private static isFormData(body: unknown): body is FormData
    {
        return body instanceof FormData;
    }
}

/**
 * Create a new contract-based API client
 */
export function createClient(config?: ClientConfig): ContractClient
{
    return new ContractClient(config);
}

/**
 * Global client singleton instance
 */
let _clientInstance: ContractClient = new ContractClient();

/**
 * Configure the global client instance
 *
 * Call this in your app initialization to set default configuration
 * for all auto-generated API calls.
 *
 * @example
 * ```ts
 * // In app initialization (layout.tsx, _app.tsx, etc)
 * import { configureClient } from '@spfn/core/client';
 *
 * configureClient({
 *   baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
 *   timeout: 60000,
 *   headers: {
 *     'X-App-Version': '1.0.0'
 *   }
 * });
 *
 * // Add interceptors
 * import { client } from '@spfn/core/client';
 * client.use(async (url, init) => {
 *   // Add auth header
 *   return {
 *     ...init,
 *     headers: {
 *       ...init.headers,
 *       Authorization: `Bearer ${getToken()}`
 *     }
 *   };
 * });
 * ```
 */
export function configureClient(config: ClientConfig): void
{
    _clientInstance = new ContractClient(config);
}

/**
 * Global client singleton with Proxy
 *
 * This client can be configured using configureClient() before use.
 * Used by auto-generated API client code.
 */
export const client = new Proxy({} as ContractClient, {
    get(_target, prop)
    {
        return _clientInstance[prop as keyof ContractClient];
    }
});

/**
 * Type guard for timeout errors
 *
 * @example
 * ```ts
 * try {
 *   await api.users.getById({ params: { id: '123' } });
 * } catch (error) {
 *   if (isTimeoutError(error)) {
 *     console.error('Request timed out, retrying...');
 *     // Implement retry logic
 *   }
 * }
 * ```
 */
export function isTimeoutError(error: unknown): error is ApiClientError
{
    return error instanceof ApiClientError && error.errorType === 'timeout';
}

/**
 * Type guard for network errors
 *
 * @example
 * ```ts
 * try {
 *   await api.users.list();
 * } catch (error) {
 *   if (isNetworkError(error)) {
 *     showOfflineMessage();
 *   }
 * }
 * ```
 */
export function isNetworkError(error: unknown): error is ApiClientError
{
    return error instanceof ApiClientError && error.errorType === 'network';
}

/**
 * Type guard for HTTP errors (4xx, 5xx)
 *
 * @example
 * ```ts
 * try {
 *   await api.users.create({ body: userData });
 * } catch (error) {
 *   if (isHttpError(error)) {
 *     if (error.status === 401) {
 *       redirectToLogin();
 *     } else if (error.status === 404) {
 *       showNotFoundMessage();
 *     }
 *   }
 * }
 * ```
 */
export function isHttpError(error: unknown): error is ApiClientError
{
    return error instanceof ApiClientError && error.errorType === 'http';
}
