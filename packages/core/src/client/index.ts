/**
 * SPFN Client Module
 *
 * Contract-based type-safe API client for browser and Next.js
 */

export {
    ContractClient,
    createClient,
    configureClient,
    client,
    ApiClientError,
    isTimeoutError,
    isNetworkError,
    isHttpError,
} from './contract-client.js';

export type {
    ClientConfig,
    CallOptions,
    RequestInterceptor,
} from './contract-client.js';