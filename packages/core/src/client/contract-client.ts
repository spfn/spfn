/**
 * Contract-Based API Client
 *
 * Type-safe HTTP client that works with RouteContract for full end-to-end type safety
 */
import type { RouteContract, InferContract } from '../route/types';
import { logger } from '../logger';

const contractClientLogger = logger.child('@spfn/core:contract-client');

/**
 * Request context shared across helper methods
 */
interface RequestContext
{
    url: string;
    urlPath: string;
    method: string;
}

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

    /**
     * Additional fetch options (extends RequestInit)
     *
     * Can be used for environment-specific options like Next.js cache/next
     *
     * @example
     * ```ts
     * // Next.js time-based revalidation
     * { fetchOptions: { next: { revalidate: 60 } } }
     *
     * // Next.js disable cache
     * { fetchOptions: { cache: 'no-store' } }
     *
     * // Next.js on-demand revalidation
     * { fetchOptions: { next: { tags: ['products'] } } }
     * ```
     */
    fetchOptions?: Record<string, any>;
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
     * @param contract - Route contract with absolute path
     * @param options - Call options (params, query, body, headers)
     */
    async call<TContract extends RouteContract>(
        contract: TContract,
        options?: CallOptions<TContract>
    ): Promise<InferContract<TContract>['response']>
    {
        // 1. Build URL and create context
        const { url, urlPath } = this.buildFullUrl(contract, options);
        const method = ContractClient.getHttpMethod(contract, options);
        const context: RequestContext = { url, urlPath, method };

        contractClientLogger.debug('Making request', { method, url });

        // 2. Prepare request
        const init = this.prepareRequestInit(contract, options);

        // 3. Setup timeout
        const { init: initWithTimeout, cleanup } = this.setupTimeout(init);

        try
        {
            // 4. Apply interceptors
            const finalInit = await this.applyInterceptors(url, initWithTimeout);

            // 5. Execute fetch
            const response = await this.fetchWithErrorHandling(url, finalInit, cleanup);

            // 6. Cleanup timeout
            cleanup();

            // 7. Parse and return response
            return await this.parseResponse<TContract>(response, context);
        }
        catch (error)
        {
            cleanup();
            throw error;
        }
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
     * Build full URL from contract and options
     */
    private buildFullUrl<TContract extends RouteContract>(
        contract: TContract,
        options?: CallOptions<TContract>
    ): { url: string; urlPath: string }
    {
        const baseUrl = options?.baseUrl || this.config.baseUrl;

        const urlPath = ContractClient.buildUrl(
            contract.path,
            options?.params as Record<string, string | number> | undefined
        );

        const queryString = ContractClient.buildQuery(
            options?.query as Record<string, string | string[] | number | boolean> | undefined
        );

        const url = `${baseUrl}${urlPath}${queryString}`;

        return { url, urlPath };
    }

    /**
     * Build headers with Content-Type handling
     */
    private buildHeaders<TContract extends RouteContract>(
        options?: CallOptions<TContract>
    ): Record<string, string>
    {
        const headers: Record<string, string> = {
            ...this.config.headers,
            ...options?.headers,
        };

        const isFormData = ContractClient.isFormData(options?.body);

        // Check for Content-Type header (case-insensitive)
        const hasContentType = Object.keys(headers).some(
            key => key.toLowerCase() === 'content-type'
        );

        if (options?.body !== undefined && !isFormData && !hasContentType)
        {
            headers['Content-Type'] = 'application/json';
        }

        return headers;
    }

    /**
     * Serialize request body
     */
    private serializeBody(body: unknown): string | FormData | undefined
    {
        if (body === undefined) return undefined;

        const isFormData = ContractClient.isFormData(body);
        return isFormData ? body : JSON.stringify(body);
    }

    /**
     * Prepare RequestInit object
     */
    private prepareRequestInit<TContract extends RouteContract>(
        contract: TContract,
        options?: CallOptions<TContract>
    ): RequestInit
    {
        const method = ContractClient.getHttpMethod(contract, options);
        const headers = this.buildHeaders(options);
        const body = this.serializeBody(options?.body);

        return {
            method,
            headers,
            body,
            ...options?.fetchOptions,
        };
    }

    /**
     * Setup timeout for request
     */
    private setupTimeout(init: RequestInit): {
        init: RequestInit;
        cleanup: () => void;
    }
    {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const finalInit = init.signal ? init : { ...init, signal: controller.signal };

        return {
            init: finalInit,
            cleanup: () => clearTimeout(timeoutId)
        };
    }

    /**
     * Apply all registered interceptors
     */
    private async applyInterceptors(url: string, init: RequestInit): Promise<RequestInit>
    {
        let finalInit = init;
        for (const interceptor of this.interceptors)
        {
            finalInit = await interceptor(url, finalInit);
        }
        return finalInit;
    }

    /**
     * Execute fetch with error handling
     */
    private async fetchWithErrorHandling(
        url: string,
        init: RequestInit,
        cleanup: () => void
    ): Promise<Response>
    {
        try
        {
            return await this.config.fetch(url, init);
        }
        catch (error)
        {
            cleanup();
            throw this.createFetchError(error, url);
        }
    }

    /**
     * Create error from fetch exception
     */
    private createFetchError(error: unknown, url: string): ApiClientError
    {
        if (error instanceof Error && error.name === 'AbortError')
        {
            return new ApiClientError(
                `Request timed out after ${this.config.timeout}ms`,
                0,
                url,
                undefined,
                'timeout'
            );
        }

        if (error instanceof Error)
        {
            return new ApiClientError(
                `Network error: ${error.message}`,
                0,
                url,
                undefined,
                'network'
            );
        }

        throw error;
    }

    /**
     * Parse JSON from response with error handling
     *
     * @param response - HTTP Response object to parse
     * @param url - Request URL for error messages
     * @param throwOnError - If true, throws ApiClientError on parse failure
     *                       If false, returns null on parse failure
     * @returns Parsed JSON data or null on failure (when throwOnError is false)
     */
    private async parseJson(
        response: Response,
        url: string,
        throwOnError: boolean
    ): Promise<any>
    {
        try
        {
            return await response.json();
        }
        catch (error)
        {
            if (throwOnError)
            {
                throw new ApiClientError(
                    `Failed to parse response as JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    response.status,
                    url,
                    undefined,
                    'http'
                );
            }

            contractClientLogger.warn('Failed to parse response JSON', {
                url,
                status: response.status,
                error: error instanceof Error ? error.message : String(error)
            });

            return null;
        }
    }

    /**
     * Parse response and handle errors
     */
    private async parseResponse<TContract extends RouteContract>(
        response: Response,
        context: RequestContext
    ): Promise<InferContract<TContract>['response']>
    {
        if (!response.ok)
        {
            throw await this.createHttpError(response, context);
        }

        return await this.parseJsonResponse<TContract>(response, context.url);
    }

    /**
     * Create HTTP error from response
     *
     * Parses ErrorResponse from server and wraps it in ApiClientError.
     * Used for serializing error info across Next.js server/client boundary.
     */
    private async createHttpError(
        response: Response,
        context: RequestContext
    ): Promise<ApiClientError>
    {
        // Parse ErrorResponse (don't throw on failure - might be HTML error page)
        const errorBody = await this.parseJson(response, context.url, false);

        return new ApiClientError(
            `${context.method} ${context.urlPath} failed: ${response.status} ${response.statusText}`,
            response.status,
            context.url,
            errorBody,  // Plain object - can be JSON.stringified for Next.js
            'http'
        );
    }

    /**
     * Parse JSON response with strict error handling
     *
     * Contract responses must be valid JSON, so we throw on parse failure.
     */
    private async parseJsonResponse<TContract extends RouteContract>(
        response: Response,
        url: string
    ): Promise<InferContract<TContract>['response']>
    {
        const data = await this.parseJson(response, url, true);
        return data as InferContract<TContract>['response'];
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
        const value = _clientInstance[prop as keyof ContractClient];
        return typeof value === 'function' ? value.bind(_clientInstance) : value;
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

/**
 * Check if error is a specific server error type
 *
 * @example
 * ```ts
 * try {
 *   await api.workflows.getById({ params: { uuid: 'xxx' } });
 * } catch (error) {
 *   if (isServerError(error, 'NotFoundError')) {
 *     showNotFoundMessage();
 *   } else if (isServerError(error, 'ValidationError')) {
 *     showValidationErrors(getServerErrorDetails(error));
 *   }
 * }
 * ```
 */
export function isServerError(error: unknown, errorType: string): error is ApiClientError
{
    if (!isHttpError(error)) return false;
    const response = error.response as any;
    return response?.error?.type === errorType;
}

/**
 * Get server error type from ApiClientError
 *
 * @example
 * ```ts
 * const errorType = getServerErrorType(error);
 * // 'NotFoundError', 'ValidationError', 'PaymentFailedError', etc.
 * ```
 */
export function getServerErrorType(error: ApiClientError): string | undefined
{
    const response = error.response as any;
    return response?.error?.type;
}

/**
 * Get server error details from ApiClientError
 *
 * @example
 * ```ts
 * if (isServerError(error, 'PaymentFailedError')) {
 *   const details = getServerErrorDetails(error);
 *   console.log('Payment ID:', details.paymentId);
 * }
 * ```
 */
export function getServerErrorDetails<T = any>(error: ApiClientError): T | undefined
{
    const response = error.response as any;
    return response?.error?.details;
}
