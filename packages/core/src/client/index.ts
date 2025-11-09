/**
 * SPFN Client Module
 *
 * Contract-based type-safe API client for browser and Next.js
 */

// Universal Client (recommended for all new projects)
export {
    UniversalClient,
    createUniversalClient,
    configureUniversalClient,
    getUniversalClient,
    universalClient,
} from './universal-client.js';

export type {
    UniversalClientConfig,
} from './universal-client.js';

// Main client exports (now using UniversalClient)
export {
    createUniversalClient as createClient,
    configureUniversalClient as configureClient,
    universalClient as client,
} from './universal-client.js';

export type {
    UniversalClientConfig as ClientConfig,
} from './universal-client.js';

// Legacy ContractClient (direct API calls only)
export {
    ContractClient,
    ApiClientError,
    isTimeoutError,
    isNetworkError,
    isHttpError,
    isServerError,
    getServerErrorType,
    getServerErrorDetails,
} from './contract-client.js';

export type {
    CallOptions,
    RequestInterceptor,
} from './contract-client.js';