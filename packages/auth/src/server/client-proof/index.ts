/**
 * @spfn/auth/client-proof — server-side clientProofV1 (issue #46).
 *
 * Implements the mobile contract's auth profile: SPFN-CANON-JSON-1 canonical
 * JSON, SPFN-PROOF-INPUT-1 proof assembly and ECDSA P-256 signature
 * verification (raw r‖s wire encoding), the contract admission order
 * (revoked → expired → replayed → signature), session issuance/expiry, the
 * contract error envelope, a Hono guard for SPFN servers, and the dev surface
 * + `/control` hooks the spfn-mobile integration suites drive.
 *
 * Contract authority: SPFN primitives. The spfn-mobile dev bundle
 * (sha256 07fd8268…a433e45) is the pinned statement this module implements;
 * its wire-header naming (D23) is ratified as proposed.
 *
 * @module server/client-proof
 */
export {
    parseCanonicalJson,
    encodeCanonicalJson,
    isCanonicalBytes,
    CanonicalJsonError,
    type CanonicalJsonErrorCode,
    type CanonicalValue,
    type CanonicalObject,
} from './canonical-json';

export {
    CLIENT_PROOF_PROFILE,
    ABSENT_BODY_SHA256,
    DEFAULT_REPLAY_WINDOW_MILLIS,
    PROOF_SIGNATURE_BYTES,
    PROOF_SIGNATURE_HEX_LENGTH,
    canonicalProofInput,
    parseClientProofPublicKey,
    signClientProof,
    verifyClientProof,
    sha256Hex,
    ProofInputError,
    type ClientProofInput,
} from './proof';

export {
    ClientProofRefusal,
    newHexId,
    type ClientProofErrorCode,
} from './refusal';

export {
    ClientProofState,
    TestClock,
    systemClock,
    DEFAULT_SESSION_TTL_MILLIS,
    type ClientProofClock,
    type ClientProofStateOptions,
    type ClientProofStats,
} from './state';

export {
    CLIENT_PROOF_HEADERS,
    CLIENT_PROOF_CONTENT_TYPE,
    admitClientProofRequest,
    type Admission,
    type ClientProofCredentials,
} from './admission';

export {
    CONTRACT_OPERATIONS,
    ContractTypeError,
    decodeHandshakeRequest,
    decodeEchoRequest,
    decodeListItemsRequest,
    encodeHandshakeResponse,
    encodeEchoResponse,
    encodeListItemsResponse,
    type ContractOperation,
    type ContractItem,
    type HandshakeRequest,
    type EchoRequest,
    type ListItemsRequest,
} from './contract-types';

export {
    createClientProofDevHandler,
    DEV_CATALOGUE,
    DEV_MAX_LIMIT,
    type ClientProofDevHandler,
    type ClientProofDevHandlerOptions,
} from './dev-handler';

export {
    CONTROL_PREFIX,
    CONTROL_TOKEN_HEADER,
} from './dev-control';

export {
    createClientProofGuard,
    type ClientProofContext,
    type ClientProofGuardOptions,
} from './guard';
