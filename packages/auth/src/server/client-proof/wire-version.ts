/**
 * What each end announces about itself, and what the server does with it.
 *
 * A client compiled and shipped separately from the server — a mobile app in a
 * store, a browser tab left open for a week — cannot be fixed by redeploying.
 * Until now a mismatch between what that client was built against and what the
 * server serves surfaced as an undecodable body: the app looked broken and
 * nothing said why.
 *
 * Both ends now say what they are. The client names its kind, its own release
 * and the contract version it was generated from; the server answers with the
 * contract version it serves and the range it accepts. Neither statement enters
 * the proof input — this is diagnostic, not something under authentication, and
 * `PROOF_INPUT_FIELDS` is unchanged.
 *
 * The server states facts and refuses what it cannot serve. It does not tell a
 * client to update: comparing its own version against the announced range and
 * deciding what the user should see is the client's judgment, made in the client.
 *
 * @module server/client-proof/wire-version
 */
import { CONTRACT_MAJOR, CONTRACT_SUPPORTED_RANGE, CONTRACT_VERSION } from './contract-bundle';
import { ClientProofRefusal } from './refusal';
import {
    CLIENT_IDENTITY_HEADERS,
    CLIENT_KINDS,
    isAppKind,
    SERVER_CONTRACT_HEADERS,
    type ClientKind,
} from './wire-headers';

export {
    CLIENT_IDENTITY_HEADERS,
    CLIENT_KINDS,
    isAppKind,
    SERVER_CONTRACT_HEADERS,
    type ClientKind,
} from './wire-headers';

/** What one request announced about the client that sent it. */
export interface ClientIdentity
{
    kind: ClientKind;

    /** The client's own release — a store version, or a bundle build. */
    version: string | null;

    /** The contract version the client was generated from. Never set for `web`. */
    contractVersion: string | null;
}

/**
 * Reads the identity headers, or null when the kind is absent or unrecognised.
 *
 * Null is not by itself a refusal — a request from something that predates
 * these headers reaches here too. `judgeClientIdentity` decides.
 */
export function readClientIdentity(headers: Headers): ClientIdentity | null
{
    const kind = headers.get(CLIENT_IDENTITY_HEADERS.kind);
    if (kind === null || !isClientKind(kind))
    {
        return null;
    }

    return {
        kind,
        version: headers.get(CLIENT_IDENTITY_HEADERS.version),
        contractVersion: headers.get(CLIENT_IDENTITY_HEADERS.contractVersion),
    };
}

function isClientKind(value: string): value is ClientKind
{
    return (CLIENT_KINDS as readonly string[]).includes(value);
}

/**
 * Whether the server serves what the client was generated against.
 *
 * Under 0.x the minor carries breaking changes, so a supported client agrees on
 * major and minor. From 1.0.0 the major alone decides. This is the rule
 * `CONTRACT_SUPPORTED_RANGE` spells out; keeping it as a comparison rather than
 * parsing that string leaves one place to change when the line reaches 1.0.0.
 */
export function isContractVersionSupported(clientVersion: string): boolean
{
    const client = parseVersion(clientVersion);
    if (client === null)
    {
        return false;
    }
    const server = parseVersion(CONTRACT_VERSION);
    if (server === null || client.major !== server.major)
    {
        return false;
    }

    return CONTRACT_MAJOR > 0 || client.minor === server.minor;
}

function parseVersion(raw: string): { major: number; minor: number } | null
{
    const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(raw);
    if (match === null)
    {
        return null;
    }

    return { major: Number(match[1]), minor: Number(match[2]) };
}

/**
 * The refusal a request's announced identity earns, or null to let it through.
 *
 * An app kind must state a contract version this server serves. A version it
 * does not serve, and the absence of one, are the same answer: the two ends do
 * not agree on what the contract is, which is what CONTRACT_UNSUPPORTED means.
 * The response carries the server's version and range, so the client can say
 * which way the gap runs.
 *
 * `web` is exempt from the contract check by construction, not by leniency.
 *
 * A request with no recognised kind passes. The check is on what a client says
 * about itself, and a caller that says nothing — a curl, a health probe, a
 * server-to-server call — is not a deployed client this rule is about.
 */
export function judgeClientIdentity(identity: ClientIdentity | null): ClientProofRefusal | null
{
    if (identity === null || !isAppKind(identity.kind))
    {
        return null;
    }
    if (identity.contractVersion === null)
    {
        return ClientProofRefusal.contractVersionMissing();
    }
    if (!isContractVersionSupported(identity.contractVersion))
    {
        return ClientProofRefusal.contractVersionUnsupported();
    }

    return null;
}

/** Writes the server's own announcement onto a response's headers. */
export function applyServerContractHeaders(headers: Headers): void
{
    headers.set(SERVER_CONTRACT_HEADERS.version, CONTRACT_VERSION);
    headers.set(SERVER_CONTRACT_HEADERS.supportedRange, CONTRACT_SUPPORTED_RANGE);
}

/** The same announcement as a plain object, for a response built from one. */
export function serverContractHeaders(): Record<string, string>
{
    return {
        [SERVER_CONTRACT_HEADERS.version]: CONTRACT_VERSION,
        [SERVER_CONTRACT_HEADERS.supportedRange]: CONTRACT_SUPPORTED_RANGE,
    };
}
