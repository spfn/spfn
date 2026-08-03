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
        | 'auth.keys.rotate';
    method: 'POST';
    path: string;

    /**
     * How a call is admitted. `clientProofV1` operations run the proof
     * admission order; `none` operations are the unproven class — accepted
     * with neither proof headers nor a session header, because enrollment is
     * called before any key exists to sign with.
     */
    authProfile: 'clientProofV1' | 'none';
    requiresSession: boolean;
    requestType: string;
    responseType: string;
    summary: string;
}

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
