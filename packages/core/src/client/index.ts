/**
 * SPFN Client Module
 *
 * Contract-based type-safe API client for Next.js
 */

// Next.js Client (recommended for all Next.js projects)
export {
    NextjsClient,
    createNextjsClient,
    configureNextjsClient,
    getNextjsClient,
    nextjsClient,
} from './nextjs/client.js';

export type {
    NextjsClientConfig,
} from './nextjs/client.js';

// Main client exports (alias for NextjsClient)
export {
    createNextjsClient as createClient,
    configureNextjsClient as configureClient,
    nextjsClient as client,
} from './nextjs/client.js';

export type {
    NextjsClientConfig as ClientConfig,
} from './nextjs/client.js';

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