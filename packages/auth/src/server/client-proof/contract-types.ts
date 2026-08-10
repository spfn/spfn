/**
 * The mobile dev-contract types and operations, decoded from / encoded to
 * canonical values. Strict on purpose: a missing required field, a wrong type
 * or an unknown field is "not the request type this operation declares".
 *
 * This module is the source of truth for `operations`. The exported contract
 * bundle (`contracts/mobile/spfn-mobile-contract.json`) is generated from it
 * by `contract-bundle.ts`; spfn-mobile consumes that export rather than the
 * other way round.
 *
 * @module server/client-proof/contract-types
 */
import {
    CORE_TIME_OPERATION_ID,
    CORE_TIME_ROUTE,
} from '@spfn/core/server';

import type { CanonicalObject, CanonicalValue } from './canonical-json';

export interface ContractOperation
{
    id:
        | 'auth.clientProof.handshake'
        | 'echo.send'
        | 'items.list'
        | 'auth.enroll.register'
        | 'auth.enroll.login'
        | 'auth.enroll.oauthNative'
        | 'auth.keys.rotate'
        | 'auth.keys.list'
        | 'auth.keys.revoke'
        | 'auth.keys.revokeAll'
        | typeof CORE_TIME_OPERATION_ID;
    method: 'GET' | 'POST';
    path: string;

    /**
     * How a call is admitted. `clientProofV1` operations run the proof
     * admission order; `none` operations are the unproven class — accepted
     * with neither proof headers nor a session header, because enrollment is
     * called before any key exists to sign with.
     */
    authProfile: 'clientProofV1' | 'none';
    requiresSession: boolean;
    /** Absent only when the operation has no request body. */
    requestType?: string;
    responseType: string;
    summary: string;

    /**
     * The contract version this operation first appeared in. Required, so an
     * operation added later cannot ship without one: omitting it is a compile
     * error rather than a hole a consumer discovers.
     *
     * It is history, not policy. This contract's compatibility policy is
     * `allOrNothing` — one version passes or refuses the whole surface — so
     * nothing here changes a verdict. It exists so a deprecation has somewhere
     * to be recorded, and as the precedent an app contract's `perOperation`
     * policy reads.
     */
    since: string;

    /**
     * The contract version that marked this operation deprecated, if one has.
     * A deprecated operation is still served: the mark is the notice that opens
     * the grace period before removal.
     */
    deprecatedIn?: string;

    /**
     * The contract version that removed this operation, if one has.
     *
     * A removed operation leaves this list, so nothing here carries the field
     * today. When the first removal happens, `removedIn` is where the fact is
     * recorded — how a removed operation stays visible after leaving the list
     * is decided then, not invented in advance.
     */
    removedIn?: string;
}

function importCoreTimeContract()
{
    const { method, path, contract } = CORE_TIME_ROUTE;
    if (method !== 'GET'
        || typeof path !== 'string'
        || contract?.auth !== 'none'
        || contract.requiresSession !== false
        || typeof contract.since !== 'string')
    {
        throw new Error('core.time does not match the clientProofV1 synchronization prerequisite');
    }

    return {
        id: CORE_TIME_OPERATION_ID,
        method,
        path,
        authProfile: contract.auth,
        requiresSession: contract.requiresSession,
        sourceSince: contract.since,
    } as const;
}

/** Validated projection of the imported core route contract. */
export const IMPORTED_CORE_TIME_CONTRACT = importCoreTimeContract();

/**
 * The core capability clientProofV1 needs before the client can mint a proof.
 *
 * Transport and admission fields come from core's exported route contract so
 * auth cannot silently restate a different path or policy. `since` is the
 * mobile-contract history, not core's package-contract history.
 */
export const CORE_PREREQUISITE_OPERATIONS: readonly ContractOperation[] = [
    {
        id: IMPORTED_CORE_TIME_CONTRACT.id,
        method: IMPORTED_CORE_TIME_CONTRACT.method,
        path: IMPORTED_CORE_TIME_CONTRACT.path,
        authProfile: IMPORTED_CORE_TIME_CONTRACT.authProfile,
        requiresSession: IMPORTED_CORE_TIME_CONTRACT.requiresSession,
        responseType: 'ServerTimeResponse',
        summary: 'Returns the server epoch used to timestamp clientProofV1 proofs.',
        since: '0.9.0',
    },
];

export const CONTRACT_OPERATIONS: readonly ContractOperation[] = [
    {
        id: 'auth.clientProof.handshake',
        method: 'POST',
        path: '/v1/auth/client-proof/handshake',
        authProfile: 'clientProofV1',
        requiresSession: false,
        requestType: 'HandshakeRequest',
        responseType: 'HandshakeResponse',
        summary: 'Presents a client proof and opens a session.',
        since: '0.1.0',
    },
    {
        id: 'echo.send',
        method: 'POST',
        path: '/v1/echo',
        authProfile: 'clientProofV1',
        requiresSession: true,
        requestType: 'EchoRequest',
        responseType: 'EchoResponse',
        summary: 'Authenticated round trip used as the smallest real vertical slice.',
        since: '0.1.0',
    },
    {
        id: 'items.list',
        method: 'POST',
        path: '/v1/items/list',
        authProfile: 'clientProofV1',
        requiresSession: true,
        requestType: 'ListItemsRequest',
        responseType: 'ListItemsResponse',
        summary: 'Authenticated paged read covering optional fields and arrays.',
        since: '0.1.0',
    },
];

/**
 * The `/_auth` surface exported into the mobile contract: enrollment, login
 * and key rotation. These are ordinary SPFN REST routes, not canonical-JSON
 * operations — the dev handler never serves them, and their wire rules are
 * the `restOperations` section of the bundle, not `canonicalJson`.
 *
 * The three `authProfile: 'none'` operations are the unproven class: they are
 * accepted with neither proof headers nor a session header, because they are
 * how a client obtains a key in the first place. `auth.keys.rotate` requires
 * an authenticated caller (a clientProofV1 proof on this surface); an
 * unproven call to it is refused like any failed admission.
 */
export const AUTH_SURFACE_OPERATIONS: readonly ContractOperation[] = [
    {
        id: 'auth.enroll.register',
        method: 'POST',
        path: '/_auth/register',
        authProfile: 'none',
        requiresSession: false,
        requestType: 'RegisterRequest',
        responseType: 'RegisterResponse',
        summary: 'Registers an account with a verification token and enrolls the client-generated public key.',
        since: '0.3.0',
    },
    {
        id: 'auth.enroll.login',
        method: 'POST',
        path: '/_auth/login',
        authProfile: 'none',
        requiresSession: false,
        requestType: 'LoginRequest',
        responseType: 'LoginResponse',
        summary: 'Authenticates with password credentials and enrolls a fresh client-generated public key.',
        since: '0.3.0',
    },
    {
        id: 'auth.enroll.oauthNative',
        method: 'POST',
        path: '/_auth/oauth/{provider}/native',
        authProfile: 'none',
        requiresSession: false,
        requestType: 'OauthNativeRequest',
        responseType: 'OauthNativeResponse',
        summary: 'Verifies a native/web social id_token server-side and enrolls the client-generated public key.',
        since: '0.3.0',
    },
    {
        id: 'auth.keys.rotate',
        method: 'POST',
        path: '/_auth/keys/rotate',
        authProfile: 'clientProofV1',
        requiresSession: false,
        requestType: 'RotateKeyRequest',
        responseType: 'RotateKeyResponse',
        summary: 'Replaces the authenticated key with a new client-generated public key before its TTL runs out.',
        since: '0.3.0',
    },
    {
        id: 'auth.keys.list',
        method: 'POST',
        path: '/_auth/keys/list',
        authProfile: 'clientProofV1',
        requiresSession: false,
        requestType: 'ListKeysRequest',
        responseType: 'ListKeysResponse',
        summary: 'Lists the keys registered to the caller, one per device that can sign for them.',
        since: '0.4.1',
    },
    {
        id: 'auth.keys.revoke',
        method: 'POST',
        path: '/_auth/keys/revoke',
        authProfile: 'clientProofV1',
        requiresSession: false,
        requestType: 'RevokeKeyRequest',
        responseType: 'RevokeKeyResponse',
        summary: 'Revokes one of the caller\'s keys, signing that device out.',
        since: '0.4.1',
    },
    {
        id: 'auth.keys.revokeAll',
        method: 'POST',
        path: '/_auth/keys/revoke-all',
        authProfile: 'clientProofV1',
        requiresSession: false,
        requestType: 'RevokeAllKeysRequest',
        responseType: 'RevokeAllKeysResponse',
        summary: 'Revokes every key the caller has, sparing the calling device unless asked otherwise.',
        since: '0.4.1',
    },
];

/** The body is canonical JSON but not the declared request type. */
export class ContractTypeError extends Error
{
    constructor()
    {
        super('not the declared contract type');
        this.name = 'ContractTypeError';
    }
}

export interface HandshakeRequest
{
    clientId: string;
    keyId: string;
    nonce: string;
    issuedAtMillis: bigint;
}

export interface EchoRequest
{
    message: string;
    sequence: bigint;
}

export interface ListItemsRequest
{
    limit: bigint;
    cursor?: string;
}

export interface ContractItem
{
    id: string;
    name: string;
    updatedAtMillis: bigint;
}

// ============================================================================
// Decoding
// ============================================================================

export function decodeHandshakeRequest(value: CanonicalValue): HandshakeRequest
{
    const members = objectWithKeys(value, ['clientId', 'keyId', 'nonce', 'issuedAtMillis'], []);

    return {
        clientId: text(members.get('clientId')),
        keyId: text(members.get('keyId')),
        nonce: text(members.get('nonce')),
        issuedAtMillis: integer(members.get('issuedAtMillis')),
    };
}

export function decodeEchoRequest(value: CanonicalValue): EchoRequest
{
    const members = objectWithKeys(value, ['message', 'sequence'], []);

    return {
        message: text(members.get('message')),
        sequence: integer(members.get('sequence')),
    };
}

export function decodeListItemsRequest(value: CanonicalValue): ListItemsRequest
{
    const members = objectWithKeys(value, ['limit'], ['cursor']);
    const request: ListItemsRequest = { limit: integer(members.get('limit')) };
    if (members.has('cursor'))
    {
        request.cursor = text(members.get('cursor'));
    }

    return request;
}

function objectWithKeys(
    value: CanonicalValue,
    required: string[],
    optional: string[],
): CanonicalObject
{
    if (!(value instanceof Map))
    {
        throw new ContractTypeError();
    }
    for (const key of required)
    {
        if (!value.has(key))
        {
            throw new ContractTypeError();
        }
    }
    for (const key of value.keys())
    {
        if (!required.includes(key) && !optional.includes(key))
        {
            throw new ContractTypeError();
        }
    }

    return value;
}

function text(value: CanonicalValue | undefined): string
{
    if (typeof value !== 'string')
    {
        throw new ContractTypeError();
    }

    return value;
}

function integer(value: CanonicalValue | undefined): bigint
{
    if (typeof value !== 'bigint')
    {
        throw new ContractTypeError();
    }

    return value;
}

// ============================================================================
// Encoding
// ============================================================================

export function encodeHandshakeResponse(sessionId: string, expiresAtMillis: bigint): CanonicalValue
{
    return new Map<string, CanonicalValue>([
        ['sessionId', sessionId],
        ['expiresAtMillis', expiresAtMillis],
    ]);
}

export function encodeEchoResponse(message: string, sequence: bigint, serverTimeMillis: bigint): CanonicalValue
{
    return new Map<string, CanonicalValue>([
        ['message', message],
        ['sequence', sequence],
        ['serverTimeMillis', serverTimeMillis],
    ]);
}

export function encodeListItemsResponse(items: ContractItem[], nextCursor: string | null): CanonicalValue
{
    const encodedItems: CanonicalValue = items.map((item) => new Map<string, CanonicalValue>([
        ['id', item.id],
        ['name', item.name],
        ['updatedAtMillis', item.updatedAtMillis],
    ]));
    const members = new Map<string, CanonicalValue>([['items', encodedItems]]);
    if (nextCursor !== null)
    {
        members.set('nextCursor', nextCursor);
    }

    return members;
}
