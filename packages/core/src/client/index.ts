/**
 * SPFN Client Module
 *
 * Contract-based type-safe API client for browser and Next.js
 * Full end-to-end type safety with RouteContract
 *
 * @example
 * ```ts
 * import { createClient } from '@spfn/core/client';
 * import { getUserContract } from './contracts';
 *
 * const client = createClient({ baseUrl: 'http://localhost:4000' });
 * const user = await client.call('/users/:id', getUserContract, {
 *   params: { id: '123' }
 * });
 * // ✅ user is fully typed based on contract.response
 * ```
 */

// Contract-based client (recommended)
export {
    ContractClient,
    createClient,
    client,
    ApiClientError,
} from './contract-client.js';

export type {
    ClientConfig,
    CallOptions,
} from './contract-client.js';