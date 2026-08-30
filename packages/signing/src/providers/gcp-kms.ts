/**
 * The `gcp-kms` provider: the private key never leaves Cloud KMS.
 *
 * `@google-cloud/kms` is an optional peer dependency and is imported here,
 * lazily, and nowhere else — importing `@spfn/signing` on a machine that has
 * never heard of Google Cloud must work.
 */

import { createPublicKey, type KeyObject } from 'node:crypto';
import { inspect } from 'node:util';
import { CompactSigner, derSignatureToJose, joseEdDsaSignature } from '../jws';
import { algorithmOf, assertKid } from '../keys';
import type { ProviderName, PublicKeyEntry, SigningAlgorithm } from '../types';

/** Typed as a string so TypeScript does not resolve an absent optional peer. */
const GCP_KMS_MODULE: string = '@google-cloud/kms';

/** A 64-bit CRC32C as the KMS API returns it: number, string, or a wrapper. */
type Crc32cValue = number | string | bigint | { value?: number | string | null } | null;

export interface GcpAsymmetricSignResponse
{
    name?: string | null;
    signature?: Uint8Array | string | null;
    signatureCrc32c?: Crc32cValue;
    verifiedDataCrc32c?: boolean | null;
}

export interface GcpPublicKeyResponse
{
    pem?: string | null;
    algorithm?: string | null;
    name?: string | null;
    /** Optional in the API; checked against `pem` whenever it is there. */
    pemCrc32c?: Crc32cValue;
}

export interface GcpCryptoKeyVersion
{
    name?: string | null;
    state?: string | null;
}

/** The slice of `KeyManagementServiceClient` this provider uses. */
export interface GcpKmsClient
{
    asymmetricSign(request: {
        name: string;
        data: Buffer;
        dataCrc32c: { value: string };
    }): Promise<[GcpAsymmetricSignResponse, ...unknown[]]>;

    getPublicKey(request: { name: string }): Promise<[GcpPublicKeyResponse, ...unknown[]]>;

    listCryptoKeyVersions?(request: {
        parent: string;
        filter?: string;
    }): Promise<[GcpCryptoKeyVersion[], ...unknown[]]>;
}

export interface GcpKmsSignerOptions
{
    /** A fully qualified `.../cryptoKeyVersions/N`. */
    keyVersionName?: string;
    /** A `.../cryptoKeys/NAME`; the newest enabled version is used. */
    keyName?: string;
    /** Defaults to the last segment of the key version name. */
    kid?: string;
    /** Inject a client; otherwise `@google-cloud/kms` is imported on demand. */
    client?: GcpKmsClient;
}

const CRC32C_TABLE = buildCrc32cTable();

function buildCrc32cTable(): Uint32Array
{
    // Castagnoli, reflected. Cloud KMS checksums every payload with it, and
    // an unchecked response is an unchecked signature.
    const table = new Uint32Array(256);

    for (let index = 0; index < 256; index += 1)
    {
        let value = index;

        for (let bit = 0; bit < 8; bit += 1)
        {
            value = value & 1 ? (value >>> 1) ^ 0x82f63b78 : value >>> 1;
        }

        table[index] = value >>> 0;
    }

    return table;
}

function crc32c(data: Buffer): number
{
    let crc = 0xffffffff;

    for (const byte of data)
    {
        crc = (crc >>> 8) ^ CRC32C_TABLE[(crc ^ byte) & 0xff];
    }

    return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Read one checksum out of a KMS response.
 *
 * Absent is `null` — the field is optional in the API, and a response that
 * never carried it is a response there is nothing to check against. Present
 * but unreadable is an error instead, and the distinction is the whole point:
 * the corruption this exists to catch can mangle the checksum field as easily
 * as the payload, so `{ value: 'corrupted' }` is precisely when the check must
 * fire rather than quietly stand down.
 */
function readCrc32c(value: Crc32cValue | undefined, field: string): number | null
{
    if (value === null || value === undefined)
    {
        return null;
    }

    const scalar = typeof value === 'object' ? value.value : value;
    const parsed = Number(scalar);

    if (!Number.isInteger(parsed))
    {
        throw new Error(
            `GcpKmsSigner: ${field} is present but is not a checksum — `
            + 'the response cannot be trusted',
        );
    }

    return parsed;
}

/**
 * The two Cloud KMS key algorithms this package speaks, named exactly.
 *
 * A `Map` rather than an object literal: a lookup keyed by a value the API
 * chose must not be able to find `constructor` on a prototype.
 */
const GCP_ALGORITHM = new Map<string, SigningAlgorithm>([
    ['EC_SIGN_ED25519', 'EdDSA'],
    ['EC_SIGN_P256_SHA256', 'ES256'],
]);

function algorithmFor(kmsAlgorithm: string): SigningAlgorithm
{
    const alg = GCP_ALGORITHM.get(kmsAlgorithm);

    if (!alg)
    {
        throw new Error(
            `GcpKmsSigner: key algorithm ${kmsAlgorithm} is not supported — `
            + 'use EC_SIGN_ED25519 (EdDSA) or EC_SIGN_P256_SHA256 (ES256)',
        );
    }

    return alg;
}

/**
 * The algorithm, agreed on twice: the response's enum and the key it shipped.
 *
 * `getPublicKey` answers with a label *and* a PEM, and nothing in the API ties
 * them together. When they disagree the response is untrustworthy and there is
 * no way to tell which half is wrong — so both are named and neither is used.
 * Trusting the label would ask KMS to sign with one algorithm while handing
 * every verifier a key for the other, and the whole fleet would reject tokens
 * that were, as far as any log could tell, signed correctly.
 */
function agreedAlgorithm(kmsAlgorithm: string, key: KeyObject): SigningAlgorithm
{
    const labelled = algorithmFor(kmsAlgorithm);
    const actual = algorithmOf(key);

    if (labelled !== actual)
    {
        throw new Error(
            `GcpKmsSigner: the key version is labelled ${kmsAlgorithm} (${labelled}) `
            + `but its public key is ${actual} — the response cannot be trusted`,
        );
    }

    return labelled;
}

async function loadClient(options: GcpKmsSignerOptions): Promise<GcpKmsClient>
{
    if (options.client)
    {
        return options.client;
    }

    const module = await import(GCP_KMS_MODULE).catch(() =>
    {
        throw new Error(
            'GcpKmsSigner: @google-cloud/kms is not installed — '
            + 'it is an optional peer dependency of @spfn/signing',
        );
    }) as { KeyManagementServiceClient: new () => GcpKmsClient };

    return new module.KeyManagementServiceClient();
}

/**
 * Check a `getPublicKey` response before anything trusts the PEM in it.
 *
 * A corrupted public key is worse than a corrupted signature: it is handed to
 * every verifier's configuration and the sign path's checksums never look at
 * it again, so the failure is a fleet-wide verification outage with no signal.
 * KMS offers `pemCrc32c` for exactly this. It is optional in the API, so an
 * absent one is skipped — but an unreadable one is refused, because a
 * response corrupted that far is the case the check is for.
 */
function checkedPublicKey(
    response: GcpPublicKeyResponse,
    keyVersionName: string,
): { pem: string; algorithm: string }
{
    if (!response.pem || !response.algorithm)
    {
        throw new Error(`GcpKmsSigner: ${keyVersionName} returned no public key`);
    }

    if (response.name && response.name !== keyVersionName)
    {
        throw new Error(
            `GcpKmsSigner: the public key came from ${response.name}, not ${keyVersionName}`,
        );
    }

    const expected = readCrc32c(response.pemCrc32c, 'pemCrc32c');

    if (expected !== null && expected !== crc32c(Buffer.from(response.pem, 'utf8')))
    {
        throw new Error('GcpKmsSigner: the public key checksum does not match the PEM');
    }

    return { pem: response.pem, algorithm: response.algorithm };
}

/** The newest enabled version of a key, when the caller named the key itself. */
async function newestEnabledVersion(client: GcpKmsClient, keyName: string): Promise<string>
{
    if (!client.listCryptoKeyVersions)
    {
        throw new Error('GcpKmsSigner: this client cannot list key versions — pass keyVersionName');
    }

    const [versions] = await client.listCryptoKeyVersions({ parent: keyName, filter: 'state=ENABLED' });
    const names = versions
        .filter((version) => version.name && (!version.state || version.state === 'ENABLED'))
        .map((version) => version.name as string)
        .sort((left, right) => versionNumber(right) - versionNumber(left));

    if (names.length === 0)
    {
        throw new Error(`GcpKmsSigner: ${keyName} has no enabled key version`);
    }

    return names[0];
}

function versionNumber(keyVersionName: string): number
{
    return Number(lastSegment(keyVersionName)) || 0;
}

function lastSegment(name: string): string
{
    return name.slice(name.lastIndexOf('/') + 1);
}

/** Signs through Cloud KMS. Build one with {@link createGcpKmsSigner}. */
export class GcpKmsSigner extends CompactSigner
{
    readonly provider: ProviderName = 'gcp-kms';

    // `#` rather than `private`: TypeScript's `private` is compile-time only,
    // and an enumerable client is one `console.log(signer)` away from having
    // its credentials formatted into a log line.
    readonly #client: GcpKmsClient;

    readonly #key: KeyObject;

    private constructor(
        readonly kid: string,
        readonly alg: SigningAlgorithm,
        readonly keyVersionName: string,
        client: GcpKmsClient,
        key: KeyObject,
    )
    {
        super();
        this.#client = client;
        this.#key = key;
    }

    static async create(options: GcpKmsSignerOptions): Promise<GcpKmsSigner>
    {
        const client = await loadClient(options);
        const keyVersionName = options.keyVersionName
            ?? (options.keyName ? await newestEnabledVersion(client, options.keyName) : null);

        if (!keyVersionName)
        {
            throw new Error('GcpKmsSigner: pass keyVersionName or keyName');
        }

        const [response] = await client.getPublicKey({ name: keyVersionName });
        const { pem, algorithm } = checkedPublicKey(response, keyVersionName);
        // Cloud KMS charges per call and a key version is immutable, so the PEM
        // is fetched and parsed once — which is also what lets the algorithm be
        // cross-checked here rather than at the first `publicKey()`.
        const key = createPublicKey(pem);

        return new GcpKmsSigner(
            assertKid(options.kid ?? lastSegment(keyVersionName)),
            agreedAlgorithm(algorithm, key),
            keyVersionName,
            client,
            key,
        );
    }

    async signRaw(input: Buffer): Promise<Buffer>
    {
        const [response] = await this.#client.asymmetricSign({
            name: this.keyVersionName,
            data: input,
            dataCrc32c: { value: String(crc32c(input)) },
        });

        return this.checkedSignature(response);
    }

    /**
     * Take the signature apart only after the response has proved itself.
     *
     * KMS returns a checksum of what it received and of what it produced; a
     * signature that survived a corrupted request is a signature over
     * something other than our token.
     */
    private checkedSignature(response: GcpAsymmetricSignResponse): Buffer
    {
        if (response.verifiedDataCrc32c !== true)
        {
            throw new Error('GcpKmsSigner: Cloud KMS did not verify the request checksum');
        }

        if (response.name && response.name !== this.keyVersionName)
        {
            throw new Error(
                `GcpKmsSigner: response came from ${response.name}, not ${this.keyVersionName}`,
            );
        }

        if (!response.signature)
        {
            throw new Error('GcpKmsSigner: Cloud KMS returned no signature');
        }

        const signature = typeof response.signature === 'string'
            ? Buffer.from(response.signature, 'base64')
            : Buffer.from(response.signature);
        const expected = readCrc32c(response.signatureCrc32c, 'signatureCrc32c');

        if (expected === null || expected !== crc32c(signature))
        {
            throw new Error('GcpKmsSigner: the signature checksum does not match the signature');
        }

        return this.alg === 'ES256'
            ? derSignatureToJose(signature)
            : joseEdDsaSignature(signature, 'GcpKmsSigner');
    }

    async publicKey(): Promise<PublicKeyEntry>
    {
        return { kid: this.kid, alg: this.alg, public: this.#key, provider: this.provider };
    }

    /** What a signer says about itself — never the client, never the key. */
    toJSON(): { provider: ProviderName; kid: string; alg: SigningAlgorithm; keyVersionName: string }
    {
        return {
            provider: this.provider,
            kid: this.kid,
            alg: this.alg,
            keyVersionName: this.keyVersionName,
        };
    }

    toString(): string
    {
        return `GcpKmsSigner(${this.kid}, ${this.alg})`;
    }

    [inspect.custom](): string
    {
        return this.toString();
    }
}

/** Resolve the key version, read its algorithm and public key, and return a signer. */
export function createGcpKmsSigner(options: GcpKmsSignerOptions): Promise<GcpKmsSigner>
{
    return GcpKmsSigner.create(options);
}
