/**
 * The mobile contract bundle — what spfn-mobile's Swift/Kotlin codegen reads.
 *
 * SPFN primitives owns the contract; this module assembles the bundle so the
 * export is produced here rather than transcribed in the consumer. Two kinds of
 * value go into it:
 *
 * - **Derived.** Operations, wire headers, proof-input fields, replay window and
 *   HTTP statuses are read from the modules that implement them. Changing the
 *   server changes the export.
 * - **Declared.** Type shapes, error summaries and the prose that describes the
 *   canonicalization and admission rules are written here. They are not derived
 *   from anything: no runtime value carries them. `contract-export.test.ts`
 *   runs the real decoders and encoders against every declaration, so a
 *   declaration that stops describing the server fails the suite.
 *
 * @module server/client-proof/contract-bundle
 */
import { createHash } from 'node:crypto';

import { KEY_TTL_DAYS } from '../lib/key-policy';
import { CLIENT_PROOF_CONTENT_TYPE, CLIENT_PROOF_HEADERS } from './admission';
import { AUTH_SURFACE_OPERATIONS, CONTRACT_OPERATIONS } from './contract-types';
import {
    CLIENT_PROOF_PROFILE,
    DEFAULT_REPLAY_WINDOW_MILLIS,
    PROOF_INPUT_FIELDS,
    PROOF_INPUT_SEPARATOR,
} from './proof';
import { CLIENT_PROOF_ERROR_CODES, HTTP_STATUS } from './refusal';

/**
 * The version this export publishes. A mistake becomes a new version.
 *
 * The line is 0.x on purpose. The contract has one consumer, it is still
 * alpha, and its first export shipped a type spelling the consumer could not
 * parse — a surface that green has not earned a stable major. Under 0.x a
 * breaking change is a minor bump, which is what that correction actually was;
 * publishing it as 1.0.1 called a breaking change a patch.
 *
 * 1.0.0 and 1.0.1 existed briefly and are withdrawn. Neither was consumed.
 *
 * 0.2.0 revises the proof mechanism from HMAC-SHA-256 (a shared key) to ECDSA
 * P-256 (a registered public key) — breaking, hence a minor bump, taken while
 * the consumer count is zero. The proof-input, wire headers, admission order
 * and error codes are unchanged.
 *
 * 0.3.0 exports the existing `/_auth` enrollment surface (register, login,
 * native OAuth, key rotation) as contract operations, introduces the unproven
 * operation class (`authProfile: 'none'`), the `boolean` scalar the enrollment
 * responses need, and the key-TTL metadata. A surface addition under 0.x is a
 * minor bump. The clientProofV1 profile itself is unchanged from 0.2.0.
 *
 * 0.3.1 adds the optional `accessToken` field to `OauthNativeRequest`, which
 * Kakao needs to resolve an email claim its id_token omits. A patch, not a
 * minor: nothing existing changes meaning, a generated consumer that never
 * sends the field still matches the server, and the supported range is
 * unchanged — so a consumer pinned at 0.3.0 stays inside it rather than
 * falling out of a range it is in fact still compatible with.
 *
 * 0.4.0 binds `OauthNativeRequest.nonce` to the key being enrolled: it must be
 * the `fingerprint` of the submitted `publicKey`. The field list is untouched,
 * but a consumer that mints a random nonce is now refused, so this is breaking
 * and the range moves with it. Without the binding a valid id_token is enough
 * to enroll any key — the token is bearer-shaped and travels, while the web
 * OAuth flow keeps its key inside CSRF-bound encrypted state.
 *
 * 0.4.1 adds the key-management operations (list, revoke, revoke-all) and the
 * types they carry. A patch: existing operations and types are untouched, and a
 * consumer generated against 0.4.0 keeps matching the server, so the supported
 * range does not move. All three are POST with their arguments in the body —
 * the proof signs body bytes, which have a canonicalization rule, while a value
 * in the path does not.
 *
 * 0.4.2 gives the REST surface a readable failure: every error response now
 * carries the `{"error":{"code","message","requestId"}}` envelope next to the
 * web fields, and `auth.enroll.oauthNative`'s twelve refusals are listed as
 * codes with their status and retryability. A patch: no request or response
 * type moves, and a consumer generated against 0.4.1 could not read these
 * failures at all — it saw one undecodable body whatever went wrong — so
 * nothing it relies on changes and the supported range stays put.
 *
 * 0.5.0 widens the type grammar so an app contract can describe shapes the auth
 * surface never needed — a floating-point `number`, `map<string,T>`, and a named
 * enum whose declaration carries values instead of fields — and states the date
 * convention rather than adding a date scalar: a moment is an integer of
 * milliseconds since the Unix epoch in a field whose name ends `AtMillis`.
 *
 * Widening the grammar alone would have been a patch. What makes this breaking is
 * that `KeySummary` did not follow the convention: `createdAt`, `lastUsedAt`,
 * `expiresAt` and `revokedAt` were ISO 8601 strings, so the same contract stated
 * one representation and shipped two. They are now `createdAtMillis`,
 * `lastUsedAtMillis`, `expiresAtMillis` and `revokedAtMillis` integers, and
 * `listKeys` returns milliseconds.
 *
 * Taken now because the cost only grows: no generated consumer reads these types
 * yet — spfn-mobile's codegen path is unbuilt — and an exception documented
 * instead of removed would have kept Swift's `ISO8601DateFormatter` rejecting
 * fractional seconds as a live way for the two SDKs to disagree, on exactly
 * these four fields. An app reading `createdAt` from `authApi.listKeys()` must
 * move to `createdAtMillis`.
 */
export const CONTRACT_VERSION = '0.5.0';
export const CONTRACT_MAJOR = 0;
export const CONTRACT_NAME = 'spfn-mobile-contract';

/** Under 0.x the minor carries breaking changes, so the range stops at 0.6.0. */
export const CONTRACT_SUPPORTED_RANGE = '>=0.5.0 <0.6.0';

/** What spfn-mobile's validator expects an upstream-exported bundle to name. */
export const EXPORT_ORIGIN = 'spfn-primitives-ci-export';

/** Bumped whenever the assembled shape changes, independent of the contract. */
export const EXPORTER_VERSION = '@spfn/auth/contract-bundle@3.0.0';

/**
 * The scalars the grammar admits.
 *
 * `integer` and `number` are separate on purpose. Collapsing a price or a
 * coordinate into `integer` makes the unit a convention nobody wrote down, and
 * collapsing a count into `number` hands Swift and Kotlin a floating-point type
 * for a value that is never fractional.
 *
 * There is no date scalar. A moment is an integer of milliseconds since the Unix
 * epoch in a field whose name ends `AtMillis`, which is what every existing type
 * already does.
 */
type ScalarTypeName = 'string' | 'integer' | 'number' | 'boolean';

/**
 * Declared names a field is allowed to reference — the types in
 * `CONTRACT_TYPES` and the enums in `CONTRACT_ENUMS` that are actually used.
 *
 * Hand-listed rather than derived: the declarations below are what would define
 * it, so deriving it would be circular, and a misspelled name has to fail here
 * rather than reach the consumer as a type it cannot find.
 */
type ReferencedTypeName = 'Item' | 'KeySummary';

type ElementTypeName = ScalarTypeName | ReferencedTypeName;

/**
 * The field-type grammar the consumer's codegen parses.
 *
 * `array<T>` and `map<string,T>` are the only container spellings: spfn-mobile's
 * `FieldType.parse` reads a recognised container prefix as a container and
 * everything else as a named type, so `Item[]` would silently become a type
 * named "Item[]" and fail at compile time rather than at parse time.
 *
 * A map's key is always a string because JSON has no other key type. Spelling it
 * out anyway keeps the consumer from having to assume it.
 *
 * This union is narrower than the grammar it guards: the grammar lets a
 * container hold another container, and the consumer's parser recurses, while
 * here a container holds one element type. Narrower is the safe direction —
 * nothing invalid can be declared — and it widens when a nested container is
 * first needed.
 */
type FieldTypeName =
    | ElementTypeName
    | `array<${ElementTypeName}>`
    | `map<string,${ElementTypeName}>`;

interface FieldDeclaration
{
    name: string;
    type: FieldTypeName;
    optional: boolean;
}

interface TypeDeclaration
{
    name: string;
    fields: FieldDeclaration[];
}

/**
 * A closed set of string values, declared by name so a field can reference it
 * the same way it references an object type.
 *
 * Empty today. The first candidate is the `algorithm` field carried by
 * `RegisterRequest`, `OauthNativeRequest` and `RotateKeyRequest`: the routes
 * constrain it to a union of `KEY_ALGORITHM` literals while this contract still
 * declares it `string`, so the contract understates the server. Declaring it
 * would change what codegen produces for a field that already exists — a
 * breaking change for the consumer's source, so a minor bump and a decision of
 * its own rather than a side effect of widening the grammar.
 */
interface EnumDeclaration
{
    name: string;
    values: readonly string[];
}

function required(name: string, type: FieldDeclaration['type']): FieldDeclaration
{
    return { name, type, optional: false };
}

function optional(name: string, type: FieldDeclaration['type']): FieldDeclaration
{
    return { name, type, optional: true };
}

/**
 * The contract types.
 *
 * The clientProofV1 request types mirror the decoders in `contract-types.ts`
 * and the response types mirror the encoders. Neither reads this table — the
 * conformance vectors are what hold the two in agreement.
 *
 * The `/_auth` surface types mirror the TypeBox route schemas (input body +
 * Next.js interceptor body merged, since a mobile client sends the whole
 * body itself) and the service result interfaces. The optional free-form
 * extension fields (`metadata`, `profile`) are deliberately not declared:
 * they are outside this grammar, the server tolerates their absence, and a
 * consumer generated from this contract never needs to send them.
 */
export const CONTRACT_TYPES: readonly TypeDeclaration[] = [
    {
        name: 'HandshakeRequest',
        fields: [
            required('clientId', 'string'),
            required('keyId', 'string'),
            required('nonce', 'string'),
            required('issuedAtMillis', 'integer'),
        ],
    },
    {
        name: 'HandshakeResponse',
        fields: [
            required('sessionId', 'string'),
            required('expiresAtMillis', 'integer'),
        ],
    },
    {
        name: 'EchoRequest',
        fields: [
            required('message', 'string'),
            required('sequence', 'integer'),
        ],
    },
    {
        name: 'EchoResponse',
        fields: [
            required('message', 'string'),
            required('sequence', 'integer'),
            required('serverTimeMillis', 'integer'),
        ],
    },
    {
        name: 'ListItemsRequest',
        fields: [
            required('limit', 'integer'),
            optional('cursor', 'string'),
        ],
    },
    {
        name: 'Item',
        fields: [
            required('id', 'string'),
            required('name', 'string'),
            required('updatedAtMillis', 'integer'),
        ],
    },
    {
        name: 'ListItemsResponse',
        fields: [
            required('items', 'array<Item>'),
            optional('nextCursor', 'string'),
        ],
    },
    {
        name: 'RegisterRequest',
        fields: [
            optional('email', 'string'),
            optional('phone', 'string'),
            required('verificationToken', 'string'),
            required('password', 'string'),
            required('publicKey', 'string'),
            required('keyId', 'string'),
            required('fingerprint', 'string'),
            required('algorithm', 'string'),
        ],
    },
    {
        name: 'RegisterResponse',
        fields: [
            required('userId', 'string'),
            required('publicId', 'string'),
            optional('email', 'string'),
            optional('phone', 'string'),
        ],
    },
    {
        name: 'LoginRequest',
        fields: [
            optional('email', 'string'),
            optional('phone', 'string'),
            required('password', 'string'),
            required('publicKey', 'string'),
            required('keyId', 'string'),
            required('fingerprint', 'string'),
            required('algorithm', 'string'),
            optional('oldKeyId', 'string'),
        ],
    },
    {
        name: 'LoginResponse',
        fields: [
            required('userId', 'string'),
            required('publicId', 'string'),
            optional('email', 'string'),
            optional('phone', 'string'),
            required('passwordChangeRequired', 'boolean'),
        ],
    },
    {
        name: 'OauthNativeRequest',
        fields: [
            required('idToken', 'string'),
            required('nonce', 'string'),
            optional('accessToken', 'string'),
            required('publicKey', 'string'),
            required('keyId', 'string'),
            required('fingerprint', 'string'),
            required('algorithm', 'string'),
        ],
    },
    {
        name: 'OauthNativeResponse',
        fields: [
            required('userId', 'string'),
            required('keyId', 'string'),
            required('isNewUser', 'boolean'),
        ],
    },
    {
        name: 'RotateKeyRequest',
        fields: [
            required('publicKey', 'string'),
            required('keyId', 'string'),
            required('fingerprint', 'string'),
            required('algorithm', 'string'),
        ],
    },
    {
        name: 'RotateKeyResponse',
        fields: [
            required('success', 'boolean'),
            required('keyId', 'string'),
        ],
    },
    {
        name: 'ListKeysRequest',
        fields: [
            optional('includeRevoked', 'boolean'),
        ],
    },
    {
        name: 'KeySummary',
        fields: [
            required('keyId', 'string'),
            optional('deviceName', 'string'),
            optional('platform', 'string'),
            required('algorithm', 'string'),
            required('fingerprintPrefix', 'string'),
            required('createdAtMillis', 'integer'),
            optional('lastUsedAtMillis', 'integer'),
            optional('expiresAtMillis', 'integer'),
            required('isExpired', 'boolean'),
            required('isActive', 'boolean'),
            optional('revokedAtMillis', 'integer'),
        ],
    },
    {
        name: 'ListKeysResponse',
        fields: [
            required('keys', 'array<KeySummary>'),
        ],
    },
    {
        name: 'RevokeKeyRequest',
        fields: [
            required('keyId', 'string'),
        ],
    },
    {
        name: 'RevokeKeyResponse',
        fields: [
            required('keyId', 'string'),
            required('selfRevoked', 'boolean'),
        ],
    },
    {
        name: 'RevokeAllKeysRequest',
        fields: [
            optional('includeCurrent', 'boolean'),
        ],
    },
    {
        name: 'RevokeAllKeysResponse',
        fields: [
            required('revokedCount', 'integer'),
            required('currentKeyRevoked', 'boolean'),
        ],
    },
];

/**
 * The enums this contract declares.
 *
 * Empty: the auth surface has one candidate and converting it is breaking. See
 * `EnumDeclaration` for which field and why it waits.
 */
export const CONTRACT_ENUMS: readonly EnumDeclaration[] = [];

/** One line per code describing what it means on the wire. */
const ERROR_SUMMARIES: Record<string, string> = {
    PROOF_INVALID: 'the client proof did not verify',
    PROOF_REPLAYED: 'the nonce was already used inside the replay window',
    PROOF_EXPIRED: 'issuedAtMillis falls outside the replay window',
    SESSION_REVOKED: 'the key or session was revoked',
    PROFILE_REJECTED: 'an auth profile outside the allowlist was named',
    CONTRACT_UNSUPPORTED: 'the request is not the shape this contract describes',
};

/**
 * No refusal is retryable without changing the request.
 *
 * An auth-family code clears after a fresh handshake, which is a different
 * request, so replaying the same bytes never helps.
 */
const RETRYABLE = false;

interface RestSurfaceError
{
    code: string;
    httpStatus: number;
    retryable: boolean;
    summary: string;
}

/**
 * Every way `auth.enroll.oauthNative` refuses, as codes a consumer can switch on.
 *
 * "Every way" includes the app's own `beforeRegister` check: what that check
 * decides is the app's business, but the response it produces is the
 * framework's — a fixed class name at a fixed status. Leaving it out would hand
 * every app that uses the hook an undecodable refusal.
 *
 * The codes are the server's own error class names rather than a second
 * vocabulary invented for mobile: two vocabularies would have to be kept in
 * step, and the mapping between them is exactly the place a wrong answer
 * hides.
 *
 * Only this operation's codes are listed. The `error` envelope now reaches
 * every REST operation, but a code list is a promise, and a promise about
 * routes whose failure paths have not been enumerated one by one would be a
 * guess. An unlisted code arriving on another operation is handled by
 * `unknownCodePolicy`, which surfaces the raw string instead of guessing at a
 * neighbour.
 */
const REST_SURFACE_ERRORS: readonly RestSurfaceError[] = [
    {
        code: 'ValidationError',
        httpStatus: 400,
        retryable: false,
        summary: 'the request body is not the shape the operation declares',
    },
    {
        code: 'NativeSignInUnsupportedError',
        httpStatus: 400,
        retryable: false,
        summary: 'this provider has no native id_token sign-in — a server configuration fact, not a user error',
    },
    {
        code: 'NonceKeyBindingError',
        httpStatus: 400,
        retryable: false,
        summary: 'the nonce is not the fingerprint of the submitted public key',
    },
    {
        code: 'InvalidKeyFingerprintError',
        httpStatus: 400,
        retryable: false,
        summary: 'the fingerprint is not the hash of the submitted public key',
    },
    {
        code: 'UnverifiedEmailLinkError',
        httpStatus: 400,
        retryable: false,
        summary: 'that email already has an account and the provider never verified it, so linking is refused',
    },
    {
        code: 'InvalidSocialTokenError',
        httpStatus: 401,
        retryable: false,
        summary: 'the id_token failed signature, issuer, audience, expiry, nonce or subject verification',
    },
    {
        code: 'AccountDisabledError',
        httpStatus: 403,
        retryable: false,
        summary: 'the account cannot open a session in its current status',
    },
    {
        code: 'AccountPendingDeletionError',
        httpStatus: 403,
        retryable: false,
        summary: 'the account is scheduled for deletion and must be restored before it can sign in',
    },
    {
        code: 'RegistrationRejectedError',
        httpStatus: 403,
        retryable: false,
        summary:
            'the app refused this sign-up in its own beforeRegister check — reached only when the identity would '
            + 'create a new account, never when it links to an existing one',
    },
    {
        code: 'KeyIdAlreadyRegisteredError',
        httpStatus: 409,
        retryable: false,
        summary: 'that keyId is taken or was revoked — generate a fresh keyId and retry',
    },
    {
        code: 'TooManyRequestsError',
        httpStatus: 429,
        retryable: true,
        summary: 'the rate limit for this endpoint was exceeded; the same request succeeds after the window',
    },
    {
        code: 'Error',
        httpStatus: 500,
        retryable: false,
        summary: 'the server failed for a reason it does not describe to the client',
    },
];

export interface MobileContractBundle
{
    [key: string]: unknown;
}

/** Assembles the bundle. Pure — same inputs, same object, every time. */
export function buildMobileContractBundle(): MobileContractBundle
{
    return {
        bundleKind: 'UPSTREAM_EXPORT',
        origin: EXPORT_ORIGIN,
        originStatement:
            'Generated from the route and contract definitions in SPFN primitives '
            + '(packages/auth/src/server/client-proof) and published from that repository. '
            + 'This file is generated output: edit the source modules and re-export, never this file.',
        contractName: CONTRACT_NAME,
        contractMajor: CONTRACT_MAJOR,
        contractVersion: CONTRACT_VERSION,
        supportedRange: CONTRACT_SUPPORTED_RANGE,
        exporterVersion: EXPORTER_VERSION,
        authProfiles: {
            allowed: [CLIENT_PROOF_PROFILE],
            unknownProfilePolicy: 'reject',
            mixingWithinSession: 'prohibited',
        },
        operationAuthClasses: {
            none:
                'the unproven class: the operation is accepted with neither proof headers nor a session header, '
                + 'because it is called before any key exists to sign with (enrollment and login)',
            [CLIENT_PROOF_PROFILE]:
                'the operation is admitted by the clientProofV1 admission order; requiresSession states whether '
                + 'the session header travels',
            rule:
                'an operation whose authProfile is not none refuses an unproven call exactly as it refuses any '
                + 'failed admission; nothing is downgraded to anonymous handling',
        },
        keyPolicy: {
            ttlDays: KEY_TTL_DAYS,
            rotationOperation: 'auth.keys.rotate',
            rule:
                'a registered public key expires ttlDays after registration; an expired or revoked key is refused '
                + 'at the revocation step (SESSION_REVOKED, non-disclosing), so the client rotates its key via the '
                + 'rotation operation before the TTL runs out',
        },
        nativeEnrollment: {
            appliesTo: 'auth.oauth.native',
            nonceRule:
                'the nonce sent with a native id_token must be the fingerprint field of the same request, which '
                + 'is the SHA-256 of the DER bytes of publicKey in lowercase hex; the server refuses the call '
                + 'when the two differ or when the fingerprint is not that key\'s hash',
            appleVariant:
                'Apple hashes the nonce it receives, so the client puts sha256hex(fingerprint) in Apple\'s '
                + 'authorization request while still sending the raw fingerprint as nonce; every other provider '
                + 'carries the raw value both ways',
            rationale:
                'an id_token is bearer-shaped and travels, so verifying it alone lets whoever holds one enroll '
                + 'any key on that account; deriving the nonce from the key means a stolen id_token carries the '
                + 'victim\'s fingerprint and cannot be paired with the attacker\'s key',
        },
        restOperations: {
            appliesTo: 'every operation whose path starts with /_auth',
            requestBody:
                'plain JSON of the request type, validated server-side; canonical-JSON encoding is required only '
                + 'when the call is proven (the proof binds the canonical bytes)',
            responseBody: 'the response type as plain JSON, with no envelope around it',
            errorEnvelope:
                'the same {"error":{"code","message","requestId"}} envelope every operation uses, carried '
                + 'alongside the SPFN web fields (__type and the error class\'s own public fields) in one body: '
                + 'the web client restores an error class from __type while a generated client reads error.code '
                + 'and ignores the rest. The codes are the server error class names listed under errors with '
                + 'surface "rest", not the six clientProofV1 refusal codes — those reach only proven calls',
            pathTemplate:
                'a {name} segment is a path parameter the client substitutes before signing or sending; '
                + '{provider} is the social provider id (google, apple, kakao, naver)',
            policy:
                'rate limits and other route policies are server posture, not contract surface: this bundle '
                + 'states wire shapes only',
        },
        canonicalJson: {
            algorithm: 'SPFN-CANON-JSON-1',
            objectKeyOrder: 'ascending by UTF-8 byte sequence',
            whitespace: 'none',
            numbers: 'signed 64-bit integers only; a fractional or non-finite number is a canonicalization error',
            stringEscapes:
                'quotation mark and reverse solidus escaped; C0 controls use \\b \\f \\n \\r \\t where defined '
                + 'and \\u00XX otherwise; every other scalar is emitted literally',
            encoding: 'UTF-8',
        },
        clientProofV1: {
            profile: CLIENT_PROOF_PROFILE,
            proofInput: {
                algorithm: 'SPFN-PROOF-INPUT-1',
                separator: PROOF_INPUT_SEPARATOR,
                fields: [...PROOF_INPUT_FIELDS],
                fieldRules:
                    'no field value may contain a C0 control character; a value that does is a proof-input error, '
                    + 'because the separator would otherwise be ambiguous',
                bodySha256:
                    'lowercase base16 SHA-256 of the canonical JSON request body; the literal string of 64 zero '
                    + 'characters when an operation has no body',
            },
            digest: 'SHA-256',
            signature: {
                algorithm: 'ECDSA P-256 with SHA-256',
                encoding: 'raw r||s, two 32-byte big-endian integers, 64 bytes total, base16-lower (128 hex characters)',
                derRule:
                    'a DER-encoded signature is rejected on the wire; a platform signer that emits DER converts to '
                    + 'raw r||s before sending',
                lowS:
                    'low-S normalization is not required; uniqueness is owned by the nonce and replay window, so '
                    + 'signature malleability cannot replay a request',
                publicKey: 'SPKI DER, base64; x-spfn-key-id names a registered public key',
            },
            proofEncoding: 'base16-lower',
            replayWindowMillis: DEFAULT_REPLAY_WINDOW_MILLIS,
            clientIdRule:
                "clientId identifies the key owner; the REST surface refuses a proof whose clientId is not the key's "
                + 'owner id, with the same PROOF_INVALID a failed signature answers',
            replayRule:
                'a (clientId, nonce) pair is accepted at most once inside the replay window; a repeat is PROOF_REPLAYED',
            revocationRule:
                'a revoked keyId is rejected before the proof is verified; the outcome is SESSION_REVOKED and never '
                + 'PROOF_INVALID, so revocation is not inferable from a proof failure',
            admissionOrder: ['revocation', 'session', 'expiry', 'replay', 'proof'],
            nonceRule: 'a nonce is spent only when the request is admitted; a refused request leaves it unused',
        },
        wireMapping: {
            requestContentType: CLIENT_PROOF_CONTENT_TYPE,
            headers: { ...CLIENT_PROOF_HEADERS },
            headerOrder: Object.keys(CLIENT_PROOF_HEADERS),
            contentTypeRule:
                'the content-type header is present exactly when the request carries a body, and the body is always '
                + 'the canonical JSON of the request type',
            sessionRule: `requiresSession operations carry ${CLIENT_PROOF_HEADERS.session}; the handshake never does`,
        },
        typeGrammar: {
            scalars: ['string', 'integer', 'number', 'boolean'],
            integerVersusNumber:
                'integer is a whole number and number is floating point. A price, a coordinate and a rating are '
                + 'number; a count and a millisecond timestamp are integer.',
            array: 'array<T>, where T is itself a field type. This is the only array spelling.',
            map:
                'map<string,T>, where T is itself a field type. The key is always string because JSON has no other '
                + 'key type. This is the only map spelling.',
            named: 'any other value names one of the types or enums below',
            enumRule:
                'a name listed in "enums" is a closed set of string values rather than an object: its declaration '
                + 'carries values instead of fields, and a value outside the set is a decode failure',
            dateConvention:
                'there is no date type. A moment in time is an integer of milliseconds since the Unix epoch and its '
                + 'field name ends in AtMillis — issuedAtMillis, expiresAtMillis, createdAtMillis. A second '
                + 'representation would leave a consumer choosing between two spellings of the same value.',
            dateConventionExceptions: 'none — every moment in this contract is an AtMillis integer',
            rule:
                'a field type outside this grammar is a contract error, not something to guess at: a consumer that '
                + 'does not recognise a container spelling reads it as a type name and fails at compile time',
        },
        types: CONTRACT_TYPES.map((type) => ({
            name: type.name,
            fields: type.fields.map((field) => ({ ...field })),
        })),
        enums: CONTRACT_ENUMS.map((declaration) => ({
            name: declaration.name,
            values: [...declaration.values],
        })),
        operations: [...CONTRACT_OPERATIONS, ...AUTH_SURFACE_OPERATIONS].map((operation) => ({ ...operation })),
        errorEnvelope: {
            shape: '{"error":{"code":<string>,"message":<string>,"requestId":<string>}}',
            additionalFields:
                'the body carries further top-level fields — __type, message, and the error class\'s own public '
                + 'fields — which a decoder must ignore rather than reject; only error.code classifies the failure',
            unknownCodePolicy: 'reject',
            unknownCodeRule:
                'a code outside this list is never mapped to a neighbouring code; it surfaces as an unknown-code '
                + 'failure carrying the raw string',
        },
        errors: [
            ...CLIENT_PROOF_ERROR_CODES.map((code) => ({
                code,
                httpStatus: HTTP_STATUS[code],
                retryable: RETRYABLE,
                summary: ERROR_SUMMARIES[code],
                surface: 'clientProofV1',
            })),
            ...REST_SURFACE_ERRORS.map((error) => ({ ...error, surface: 'rest' })),
        ],
        notes: [
            'This bundle contains no secret, no real key and no production endpoint. Paths are shapes, not deployed routes.',
            'It is generated output. Edit packages/auth/src/server/client-proof and re-run the export; never edit this file.',
            'The single authority for this contract is SPFN primitives.',
        ],
    };
}

/**
 * No major in the filename while the line is 0.x: under 0.x the minor is what
 * breaks, so `v0` would name nothing useful. The version lives in the bundle
 * and the pin is the digest.
 */
export const BUNDLE_FILENAME = 'spfn-mobile-contract.json';
export const PROVENANCE_FILENAME = 'upstream-provenance.json';
export const REPOSITORY = 'git.superfunction.xyz/superfunction/primitives';
export const BUNDLE_REPO_PATH = `contracts/mobile/${BUNDLE_FILENAME}`;

/**
 * The evidence spfn-mobile's validator requires before a lock may claim an
 * upstream export.
 *
 * `source.commit` is absent by construction: a file cannot carry the SHA of the
 * commit that contains it. The exporter states everything else and the consumer
 * records which commit it read.
 */
export function buildExportProvenance(bundleSha256: string): Record<string, unknown>
{
    return {
        evidenceVersion: 1,
        origin: EXPORT_ORIGIN,
        exportedByUpstreamCI: true,
        exporterVersion: EXPORTER_VERSION,
        statement:
            'This contract bundle was generated from the route and contract definitions in SPFN primitives '
            + '(packages/auth/src/server/client-proof) by packages/auth/scripts/export-mobile-contract.ts. '
            + 'It was not transcribed from any consumer.',
        source: {
            repository: REPOSITORY,
            bundlePath: BUNDLE_REPO_PATH,
            commit: 'RECORDED_BY_CONSUMER',
            commitRule:
                'The consumer sets its own lock source.commit to the exact primitives commit it read this '
                + 'bundle from. A file cannot carry its own commit SHA.',
        },
        contract: {
            name: CONTRACT_NAME,
            version: CONTRACT_VERSION,
            major: CONTRACT_MAJOR,
            supportedRange: CONTRACT_SUPPORTED_RANGE,
            bundleSha256,
        },
        verification: {
            digest: `shasum -a 256 ${BUNDLE_REPO_PATH}`,
            regenerate: 'pnpm --filter @spfn/auth export:mobile-contract',
            enforcedBy: [
                'packages/auth/src/server/client-proof/__tests__/contract-export.test.ts',
                '.github/workflows/verify-mobile-contract.yml',
            ],
            rule:
                'The committed bundle must be byte-identical to what the exporter produces. The test above '
                + 'regenerates and compares, so an edited bundle fails the suite rather than shipping.',
        },
        notes: [
            'The bundle carries no secret, no real key and no production endpoint.',
            'A published contract version and digest are never modified. A mistake becomes a new version.',
        ],
    };
}

/**
 * The bundle as the bytes that get committed and digested.
 *
 * A value short enough to fit on one line stays on one line: it keeps field
 * declarations and short lists readable, and it is what makes the emitted text
 * stable across runs. Everything else is indented two spaces.
 */
export function serializeMobileContractBundle(bundle: MobileContractBundle): string
{
    return `${render(bundle, 0)}\n`;
}

/** Both files of the export, and the digest the consumer pins. */
export function renderMobileContractExport(): { bundle: string; provenance: string; bundleSha256: string }
{
    const bundle = serializeMobileContractBundle(buildMobileContractBundle());
    const bundleSha256 = createHash('sha256').update(bundle, 'utf8').digest('hex');
    const provenance = `${JSON.stringify(buildExportProvenance(bundleSha256), null, 2)}\n`;

    return { bundle, provenance, bundleSha256 };
}

const MAX_INLINE_WIDTH = 100;

function render(value: unknown, depth: number): string
{
    const inline = JSON.stringify(value);
    if (inline === undefined)
    {
        throw new Error('the contract bundle carries a value JSON cannot represent');
    }
    const pad = '  '.repeat(depth);
    if (inline.length + pad.length <= MAX_INLINE_WIDTH || typeof value !== 'object' || value === null)
    {
        return spaced(inline);
    }

    const inner = '  '.repeat(depth + 1);
    if (Array.isArray(value))
    {
        const items = value.map((item) => `${inner}${render(item, depth + 1)}`);

        return `[\n${items.join(',\n')}\n${pad}]`;
    }

    const members = Object.entries(value as Record<string, unknown>)
        .map(([key, member]) => `${inner}${JSON.stringify(key)}: ${render(member, depth + 1)}`);

    return `{\n${members.join(',\n')}\n${pad}}`;
}

/** `{"a":1}` → `{ "a": 1 }` — the inline form used inside the indented one. */
function spaced(inline: string): string
{
    if (!inline.startsWith('{') && !inline.startsWith('['))
    {
        return inline;
    }
    let out = '';
    let inString = false;
    let escaped = false;
    for (const ch of inline)
    {
        if (escaped)
        {
            out += ch;
            escaped = false;
            continue;
        }
        if (ch === '\\' && inString)
        {
            out += ch;
            escaped = true;
            continue;
        }
        if (ch === '"')
        {
            inString = !inString;
            out += ch;
            continue;
        }
        if (inString)
        {
            out += ch;
            continue;
        }
        out += separatorFor(ch);
    }

    return out;
}

function separatorFor(ch: string): string
{
    if (ch === ':' || ch === ',')
    {
        return `${ch} `;
    }
    if (ch === '{')
    {
        return '{ ';
    }
    if (ch === '}')
    {
        return ' }';
    }

    return ch;
}
