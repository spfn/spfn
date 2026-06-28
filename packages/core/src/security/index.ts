/**
 * @spfn/core/security - Outbound request safety helpers
 */

export {
    safeFetch,
    createSafeFetch,
    assertSafeUrl,
    isPrivateOrReservedIp,
    setDefaultSafeFetchPolicy,
    getDefaultSafeFetchPolicy,
    SsrfBlockedError,
} from './safe-fetch';
export type { SafeFetchPolicy } from './safe-fetch';
