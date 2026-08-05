/**
 * The header names each end announces itself under.
 *
 * Separated from the logic that reads them so the contract bundle can name them
 * without importing the version comparison, which reads the bundle back. These
 * are declarations and depend on nothing.
 *
 * @module server/client-proof/wire-headers
 */

/** What a client says about itself, one header each. */
export const CLIENT_IDENTITY_HEADERS = {
    kind: 'x-spfn-client-kind',
    version: 'x-spfn-client-version',
    contractVersion: 'x-spfn-client-contract-version',
} as const;

/**
 * What the server says about itself, on every response.
 *
 * Distinct names from the request headers on purpose: a proxy that echoes a
 * request header into the response would otherwise make the client's own
 * version look like the server's.
 */
export const SERVER_CONTRACT_HEADERS = {
    version: 'x-spfn-server-contract-version',
    supportedRange: 'x-spfn-supported-contract-range',
} as const;

/**
 * The client kinds the server distinguishes.
 *
 * `web` is separated from the two app kinds because it carries no contract
 * version: a browser bundle is deployed with the server that serves it, so
 * there is no second version to reconcile.
 */
export const CLIENT_KINDS = ['web', 'ios', 'android'] as const;

export type ClientKind = typeof CLIENT_KINDS[number];

/** A kind that ships independently of the server, so its contract version matters. */
export function isAppKind(kind: ClientKind): boolean
{
    return kind !== 'web';
}
