/**
 * The checks between a clientProofV1 request arriving and being applied.
 *
 * Shape first, then the profile allowlist, then the proof. That order is
 * forced: none of the proof checks can run until the fields they read are
 * known to be present and the body is known to be the bytes the digest is
 * supposed to cover. The order *inside* the proof checks is the contract's and
 * lives in `ClientProofState.admit`.
 *
 * @module server/client-proof/admission
 */
import { isCanonicalBytes, parseCanonicalJson, type CanonicalValue } from './canonical-json';
import { CLIENT_PROOF_PROFILE, sha256Hex, type ClientProofInput } from './proof';
import { ClientProofRefusal } from './refusal';
import type { ClientProofState } from './state';

/** D23 wire-header names, ratified as proposed by the mobile dev bundle. */
export const CLIENT_PROOF_HEADERS = {
    profile: 'x-spfn-auth-profile',
    clientId: 'x-spfn-client-id',
    keyId: 'x-spfn-key-id',
    nonce: 'x-spfn-nonce',
    issuedAtMillis: 'x-spfn-issued-at',
    proof: 'x-spfn-proof',
    session: 'x-spfn-session',
} as const;

export const CLIENT_PROOF_CONTENT_TYPE = 'application/json';

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;

/** The contract header fields one request presented. */
export interface ClientProofCredentials
{
    profile: string;
    clientId: string;
    keyId: string;
    nonce: string;
    issuedAtMillis: bigint;
    proof: string;
    sessionId: string | null;
}

export type Admission =
    | { admitted: false; refusal: ClientProofRefusal }
    | { admitted: true; value: CanonicalValue; credentials: ClientProofCredentials };

/**
 * Runs every check for one operation over already-read body bytes.
 *
 * `path` must be the operation's contract path (what the client signed), not a
 * proxied or rewritten one.
 */
export function admitClientProofRequest(args: {
    state: ClientProofState;
    headers: Headers;
    method: string;
    path: string;
    requiresSession: boolean;
    body: Uint8Array;
}): Admission
{
    const credentials = readCredentials(args.headers);
    if (credentials === null)
    {
        return refused(ClientProofRefusal.malformedHeaders());
    }
    if (credentials.profile !== CLIENT_PROOF_PROFILE)
    {
        return refused(ClientProofRefusal.profileRejected());
    }
    if (!isRequestContentType(args.headers.get('content-type')))
    {
        return refused(ClientProofRefusal.missingContentType());
    }
    if (args.requiresSession !== (credentials.sessionId !== null))
    {
        return refused(ClientProofRefusal.sessionHeaderMisplaced());
    }

    let value: CanonicalValue;
    try
    {
        value = parseCanonicalJson(args.body);
    }
    catch
    {
        return refused(ClientProofRefusal.bodyNotCanonical());
    }
    // The proof binds the received bytes; accepting a re-serialization would
    // let two implementations disagree about what was signed.
    if (!isCanonicalBytes(args.body, value))
    {
        return refused(ClientProofRefusal.bodyNotCanonical());
    }

    const proofInput: ClientProofInput = {
        method: args.method,
        path: args.path,
        clientId: credentials.clientId,
        keyId: credentials.keyId,
        nonce: credentials.nonce,
        issuedAtMillis: credentials.issuedAtMillis,
        bodySha256: sha256Hex(args.body),
    };

    let refusal: ClientProofRefusal | null;
    try
    {
        refusal = args.state.admit({
            clientId: credentials.clientId,
            keyId: credentials.keyId,
            presentedSessionId: credentials.sessionId,
            requiresSession: args.requiresSession,
            proofInput,
            presentedProof: credentials.proof,
        });
    }
    catch
    {
        // A C0 control character in a header field makes the proof input
        // unassemblable — the request is not the shape the contract describes.
        return refused(ClientProofRefusal.unprocessable());
    }
    if (refusal !== null)
    {
        return refused(refusal);
    }

    return { admitted: true, value, credentials };
}

function refused(refusal: ClientProofRefusal): Admission
{
    return { admitted: false, refusal };
}

/**
 * The contract header fields, or null when any is absent or malformed.
 *
 * Fetch `Headers` folds a repeated field into one comma-joined value, so
 * "sent more than once" is not directly observable here; a folded value fails
 * either the issuedAt grammar or proof verification instead.
 */
function readCredentials(headers: Headers): ClientProofCredentials | null
{
    const profile = headers.get(CLIENT_PROOF_HEADERS.profile);
    const clientId = headers.get(CLIENT_PROOF_HEADERS.clientId);
    const keyId = headers.get(CLIENT_PROOF_HEADERS.keyId);
    const nonce = headers.get(CLIENT_PROOF_HEADERS.nonce);
    const issuedAtRaw = headers.get(CLIENT_PROOF_HEADERS.issuedAtMillis);
    const proof = headers.get(CLIENT_PROOF_HEADERS.proof);
    if (profile === null || clientId === null || keyId === null
        || nonce === null || issuedAtRaw === null || proof === null)
    {
        return null;
    }
    const issuedAtMillis = parseInt64(issuedAtRaw);
    if (issuedAtMillis === null)
    {
        return null;
    }

    return {
        profile,
        clientId,
        keyId,
        nonce,
        issuedAtMillis,
        proof,
        sessionId: headers.get(CLIENT_PROOF_HEADERS.session),
    };
}

function parseInt64(raw: string): bigint | null
{
    if (!/^[+-]?\d{1,19}$/.test(raw))
    {
        return null;
    }
    const value = BigInt(raw);
    if (value < INT64_MIN || value > INT64_MAX)
    {
        return null;
    }

    return value;
}

function isRequestContentType(value: string | null): boolean
{
    if (value === null)
    {
        return false;
    }

    return value.split(';')[0].trim().toLowerCase() === CLIENT_PROOF_CONTENT_TYPE;
}
