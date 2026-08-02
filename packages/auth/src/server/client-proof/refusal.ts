/**
 * Every way a clientProofV1 server refuses a request.
 *
 * The contract declares six error codes and forbids inventing a seventh, so
 * every refusal here is one of the six. Two rules decide which code a refusal
 * gets (mirroring the spfn-mobile reference server, the executable spec):
 *
 * 1. A refusal a new session could clear is an auth-family code (401). The SDK
 *    re-handshakes exactly once on those.
 * 2. Everything else — the request is not the shape the contract describes —
 *    is CONTRACT_UNSUPPORTED: the two ends do not agree on what the contract
 *    is. PROOF_INVALID would provoke a pointless re-handshake and
 *    PROFILE_REJECTED names one specific thing (a profile outside the
 *    allowlist), used for exactly and only that.
 *
 * Every message is a fixed string: a message assembled from the request would
 * put a nonce, session id or body fragment into an error the client may log.
 *
 * @module server/client-proof/refusal
 */
import { randomBytes } from 'node:crypto';

import { encodeCanonicalJson, type CanonicalObject, type CanonicalValue } from './canonical-json';

/** The six wire codes. The SDKs classify by code, never HTTP status. */
export type ClientProofErrorCode =
    | 'PROOF_INVALID'
    | 'PROOF_REPLAYED'
    | 'PROOF_EXPIRED'
    | 'SESSION_REVOKED'
    | 'PROFILE_REJECTED'
    | 'CONTRACT_UNSUPPORTED';

/** The declaration order of the six codes — the contract export emits this order. */
export const CLIENT_PROOF_ERROR_CODES: readonly ClientProofErrorCode[] = [
    'PROOF_INVALID',
    'PROOF_REPLAYED',
    'PROOF_EXPIRED',
    'SESSION_REVOKED',
    'PROFILE_REJECTED',
    'CONTRACT_UNSUPPORTED',
];

/** The status each code answers with. The contract export reads this. */
export const HTTP_STATUS: Record<ClientProofErrorCode, number> = {
    PROOF_INVALID: 401,
    PROOF_REPLAYED: 401,
    PROOF_EXPIRED: 401,
    SESSION_REVOKED: 401,
    PROFILE_REJECTED: 400,
    CONTRACT_UNSUPPORTED: 409,
};

/** 128 random bits as lowercase base16 — request ids and control tokens. */
export function newHexId(): string
{
    return randomBytes(16).toString('hex');
}

export class ClientProofRefusal
{
    constructor(
        readonly code: ClientProofErrorCode,
        readonly message: string,
    ) 
    {}

    get httpStatus(): number
    {
        return HTTP_STATUS[this.code];
    }

    /** The canonical bytes of `{"error":{"code":…,"message":…,"requestId":…}}`. */
    envelopeBytes(requestId: string): Uint8Array
    {
        const error: CanonicalObject = new Map<string, CanonicalValue>([
            ['code', this.code],
            ['message', this.message],
            ['requestId', requestId],
        ]);

        return encodeCanonicalJson(new Map<string, CanonicalValue>([['error', error]]));
    }

    /** Nothing request-derived reaches a log through this. */
    toString(): string
    {
        return `ClientProofRefusal(${this.code})`;
    }

    // ---- shape: what arrived is not the contract (rule 2) -------------------

    static unroutable(): ClientProofRefusal
    {
        return contractViolation('no operation in this contract answers that method and path');
    }

    static malformedHeaders(): ClientProofRefusal
    {
        return contractViolation('the request does not carry the contract header fields exactly once each');
    }

    static missingContentType(): ClientProofRefusal
    {
        return contractViolation('a request that carries a body must declare the contract content type');
    }

    static bodyTooLarge(): ClientProofRefusal
    {
        return contractViolation('the request body exceeds the size this server accepts');
    }

    /**
     * The body parsed but its bytes are not the canonical form of what it
     * parsed to. Not PROOF_INVALID even though it is discovered next to the
     * proof: the proof over these bytes verifies perfectly well, and an
     * auth-family answer would tell the client to re-handshake and send the
     * same non-canonical bytes again.
     */
    static bodyNotCanonical(): ClientProofRefusal
    {
        return contractViolation('the request body is not the canonical JSON form of the value it encodes');
    }

    static bodyNotTheDeclaredType(): ClientProofRefusal
    {
        return contractViolation('the request body is not the request type this operation declares');
    }

    static sessionHeaderMisplaced(): ClientProofRefusal
    {
        return contractViolation('the session header is present exactly on the operations that require one');
    }

    static unprocessable(): ClientProofRefusal
    {
        return contractViolation('the request could not be processed');
    }

    // ---- the profile allowlist ----------------------------------------------

    static profileRejected(): ClientProofRefusal
    {
        return new ClientProofRefusal('PROFILE_REJECTED', "the named auth profile is not on this contract's allowlist");
    }

    // ---- auth: a new session might clear it (rule 1) -------------------------

    static sessionRevoked(): ClientProofRefusal
    {
        return new ClientProofRefusal('SESSION_REVOKED', 'the key or session was revoked');
    }

    static proofExpired(): ClientProofRefusal
    {
        return new ClientProofRefusal('PROOF_EXPIRED', 'issuedAtMillis falls outside the replay window');
    }

    static proofReplayed(): ClientProofRefusal
    {
        return new ClientProofRefusal('PROOF_REPLAYED', 'the nonce was already used inside the replay window');
    }

    static proofInvalid(): ClientProofRefusal
    {
        return new ClientProofRefusal('PROOF_INVALID', 'the client proof did not verify');
    }
}

function contractViolation(message: string): ClientProofRefusal
{
    return new ClientProofRefusal('CONTRACT_UNSUPPORTED', message);
}
