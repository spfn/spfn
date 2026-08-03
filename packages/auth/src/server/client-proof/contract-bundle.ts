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
 */
export const CONTRACT_VERSION = '0.3.0';
export const CONTRACT_MAJOR = 0;
export const CONTRACT_NAME = 'spfn-mobile-contract';

/** Under 0.x the minor carries breaking changes, so the range stops at 0.4.0. */
export const CONTRACT_SUPPORTED_RANGE = '>=0.3.0 <0.4.0';

/** What spfn-mobile's validator expects an upstream-exported bundle to name. */
export const EXPORT_ORIGIN = 'spfn-primitives-ci-export';

/** Bumped whenever the assembled shape changes, independent of the contract. */
export const EXPORTER_VERSION = '@spfn/auth/contract-bundle@3.0.0';

/**
 * The field-type grammar the consumer's codegen parses.
 *
 * `array<T>` is the only array spelling: spfn-mobile's `FieldType.parse` treats
 * `array<…>` as an array and everything else as a named type, so `Item[]` would
 * silently become a type named "Item[]" and fail at compile time rather than at
 * parse time.
 */
type FieldTypeName = 'string' | 'integer' | 'boolean' | 'array<Item>';

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
];

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
        restOperations: {
            appliesTo: 'every operation whose path starts with /_auth',
            requestBody:
                'plain JSON of the request type, validated server-side; canonical-JSON encoding is required only '
                + 'when the call is proven (the proof binds the canonical bytes)',
            responseBody: 'the response type as plain JSON, with no envelope around it',
            errorEnvelope:
                'the SPFN error shape {"error": {...}} with HTTP status semantics, not the six-code contract '
                + 'envelope; only proven calls can receive the contract refusal codes, via the middleware',
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
            scalars: ['string', 'integer', 'boolean'],
            array: 'array<T>, where T is itself a field type. This is the only array spelling.',
            named: 'any other value names one of the types below',
            rule:
                'a field type outside this grammar is a contract error, not something to guess at: a consumer that '
                + 'does not recognise an array spelling reads it as a type name and fails at compile time',
        },
        types: CONTRACT_TYPES.map((type) => ({
            name: type.name,
            fields: type.fields.map((field) => ({ ...field })),
        })),
        operations: [...CONTRACT_OPERATIONS, ...AUTH_SURFACE_OPERATIONS].map((operation) => ({ ...operation })),
        errorEnvelope: {
            shape: '{"error":{"code":<string>,"message":<string>,"requestId":<string>}}',
            unknownCodePolicy: 'reject',
            unknownCodeRule:
                'a code outside this list is never mapped to a neighbouring code; it surfaces as an unknown-code '
                + 'failure carrying the raw string',
        },
        errors: CLIENT_PROOF_ERROR_CODES.map((code) => ({
            code,
            httpStatus: HTTP_STATUS[code],
            retryable: RETRYABLE,
            summary: ERROR_SUMMARIES[code],
        })),
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
