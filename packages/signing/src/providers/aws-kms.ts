/**
 * The `aws-kms` provider: the private key never leaves AWS KMS.
 *
 * Both algorithms: an `ECC_NIST_P256` key signs ES256 with `ECDSA_SHA_256`,
 * and an `ECC_NIST_EDWARDS25519` key signs EdDSA with `ED25519_SHA_512`. The
 * key's own spec decides which, exactly as it does on `gcp-kms`.
 *
 * `@aws-sdk/client-kms` is an optional peer dependency, imported lazily here
 * and nowhere else.
 */

import { createPublicKey, type KeyObject } from 'node:crypto';
import { inspect } from 'node:util';
import { CompactSigner, derSignatureToJose, joseEdDsaSignature } from '../jws';
import { algorithmOf, assertKid } from '../keys';
import type { ProviderName, PublicKeyEntry, SigningAlgorithm } from '../types';

/** Typed as a string so TypeScript does not resolve an absent optional peer. */
const AWS_KMS_MODULE: string = '@aws-sdk/client-kms';

/**
 * The largest message KMS will accept whole.
 *
 * `MessageType: RAW` hands KMS the message itself rather than a digest, which
 * caps it at 4 KiB. Both algorithms need it: ES256 keeps the SHA-256 on the
 * server side, and `ED25519_SHA_512` is PureEdDSA, which signs the message and
 * has no pre-hashed form here — `ED25519_PH_SHA_512` is a different algorithm
 * and is not used. A token whose signing input is larger cannot be signed this
 * way; sign a smaller payload.
 */
const RAW_MESSAGE_LIMIT = 4096;

/** The key specs KMS names for the two algorithms this provider signs with. */
const KMS_KEY_SPEC = new Map<string, SigningAlgorithm>([
    ['ECC_NIST_P256', 'ES256'],
    ['ECC_NIST_EDWARDS25519', 'EdDSA'],
]);

/** The KMS signing algorithm each of this package's algorithms is signed with. */
const KMS_SIGNING_ALGORITHM = {
    ES256: 'ECDSA_SHA_256',
    EdDSA: 'ED25519_SHA_512',
} as const satisfies Record<SigningAlgorithm, string>;

/** What KMS calls the algorithms this provider asks it for. */
export type AwsSigningAlgorithm = typeof KMS_SIGNING_ALGORITHM[SigningAlgorithm];

export interface AwsSignResponse
{
    Signature?: Uint8Array | null;
}

export interface AwsGetPublicKeyResponse
{
    PublicKey?: Uint8Array | null;
    KeyId?: string | null;
    /** Optional in this interface; cross-checked against `PublicKey` when sent. */
    KeySpec?: string | null;
}

/** The slice of the KMS API this provider uses, so a test can supply it. */
export interface AwsKmsClient
{
    sign(request: {
        KeyId: string;
        Message: Uint8Array;
        MessageType: 'RAW';
        SigningAlgorithm: AwsSigningAlgorithm;
    }): Promise<AwsSignResponse>;

    getPublicKey(request: { KeyId: string }): Promise<AwsGetPublicKeyResponse>;
}

export interface AwsKmsSignerOptions
{
    /** A key id, an alias (`alias/name`), or either one's ARN. */
    keyId: string;
    /** The algorithm you expect. Checked against the key, which is what decides. */
    alg?: SigningAlgorithm;
    /** Defaults to the last `/`-separated segment of `keyId`. */
    kid?: string;
    /** Passed to `KMSClient` when this provider constructs one. */
    region?: string;
    /** Inject a client; otherwise `@aws-sdk/client-kms` is imported on demand. */
    client?: AwsKmsClient;
}

/**
 * The kid an ARN or an alias implies.
 *
 * `arn:aws:kms:eu-west-1:1234:key/9d8e…` and `alias/spfn-bridge` both end in
 * the part a person would call the key, and neither of the prefixes is
 * anything a `kid` may contain.
 */
function kidFromKeyId(keyId: string): string
{
    return keyId.slice(keyId.lastIndexOf('/') + 1);
}

async function loadClient(options: AwsKmsSignerOptions): Promise<AwsKmsClient>
{
    if (options.client)
    {
        return options.client;
    }

    const module = await import(AWS_KMS_MODULE).catch(() =>
    {
        throw new Error(
            'AwsKmsSigner: @aws-sdk/client-kms is not installed — '
            + 'it is an optional peer dependency of @spfn/signing',
        );
    }) as {
        KMSClient: new (config: { region?: string }) => { send(command: unknown): Promise<any> };
        SignCommand: new (input: unknown) => unknown;
        GetPublicKeyCommand: new (input: unknown) => unknown;
    };

    const client = new module.KMSClient({ region: options.region });

    return {
        sign: (request) => client.send(new module.SignCommand(request)),
        getPublicKey: (request) => client.send(new module.GetPublicKeyCommand(request)),
    };
}

/**
 * Refuse a response whose `KeySpec` and whose SPKI describe different keys.
 *
 * The SPKI is what gets published to verifiers, so it is what decides — but
 * `GetPublicKey` states the spec beside it, and a response where the two
 * disagree is one that has been mangled or substituted somewhere between KMS
 * and here. There is no half of it worth using. The field is optional, so a
 * response that never carried one is simply nothing to cross-check.
 */
function checkKeySpec(keySpec: string | null | undefined, alg: SigningAlgorithm, keyId: string): void
{
    if (keySpec !== null && keySpec !== undefined && KMS_KEY_SPEC.get(keySpec) !== alg)
    {
        throw new Error(
            `AwsKmsSigner: ${keyId} answered with KeySpec ${keySpec} but its public key `
            + `is an ${alg} key — the response cannot be trusted`,
        );
    }
}

async function fetchPublicKey(client: AwsKmsClient, keyId: string): Promise<KeyObject>
{
    const response = await client.getPublicKey({ KeyId: keyId });

    if (!response.PublicKey)
    {
        throw new Error(`AwsKmsSigner: ${keyId} returned no public key`);
    }

    const key = createPublicKey({
        key: Buffer.from(response.PublicKey),
        format: 'der',
        type: 'spki',
    });

    checkKeySpec(response.KeySpec, algorithmOf(key), keyId);

    return key;
}

/** Signs through AWS KMS. Build one with {@link createAwsKmsSigner}. */
export class AwsKmsSigner extends CompactSigner
{
    readonly provider: ProviderName = 'aws-kms';

    // `#` rather than `private`: TypeScript's `private` is compile-time only,
    // and an enumerable client is one `console.log(signer)` away from having
    // its credentials formatted into a log line.
    readonly #client: AwsKmsClient;

    readonly #key: KeyObject;

    private constructor(
        readonly kid: string,
        readonly keyId: string,
        readonly alg: SigningAlgorithm,
        client: AwsKmsClient,
        key: KeyObject,
    )
    {
        super();
        this.#client = client;
        this.#key = key;
    }

    static async create(options: AwsKmsSignerOptions): Promise<AwsKmsSigner>
    {
        const kid = assertKid(options.kid ?? kidFromKeyId(options.keyId));
        const client = await loadClient(options);
        const key = await fetchPublicKey(client, options.keyId);

        // The key spec is the algorithm; `alg` only says what you expected.
        const alg = algorithmOf(key);

        if (options.alg && options.alg !== alg)
        {
            throw new Error(
                `AwsKmsSigner: ${options.keyId} is an ${alg} key, not ${options.alg}`,
            );
        }

        return new AwsKmsSigner(kid, options.keyId, alg, client, key);
    }

    async signRaw(input: Buffer): Promise<Buffer>
    {
        if (input.length > RAW_MESSAGE_LIMIT)
        {
            throw new Error(
                `AwsKmsSigner: the signing input is ${input.length} bytes and KMS takes at most `
                + `${RAW_MESSAGE_LIMIT} — sign a smaller payload`,
            );
        }

        const response = await this.#client.sign({
            KeyId: this.keyId,
            Message: input,
            MessageType: 'RAW',
            SigningAlgorithm: KMS_SIGNING_ALGORITHM[this.alg],
        });

        if (!response.Signature)
        {
            throw new Error('AwsKmsSigner: AWS KMS returned no signature');
        }

        const signature = Buffer.from(response.Signature);

        // ECDSA comes back in DER, which JOSE forbids; Ed25519 comes back as
        // the 64 raw bytes JOSE already wants.
        return this.alg === 'ES256'
            ? derSignatureToJose(signature)
            : joseEdDsaSignature(signature, 'AwsKmsSigner');
    }

    async publicKey(): Promise<PublicKeyEntry>
    {
        return { kid: this.kid, alg: this.alg, public: this.#key, provider: this.provider };
    }

    /** What a signer says about itself — never the client, never the key. */
    toJSON(): { provider: ProviderName; kid: string; alg: SigningAlgorithm; keyId: string }
    {
        return { provider: this.provider, kid: this.kid, alg: this.alg, keyId: this.keyId };
    }

    toString(): string
    {
        return `AwsKmsSigner(${this.kid}, ${this.alg})`;
    }

    [inspect.custom](): string
    {
        return this.toString();
    }
}

/** Read the key's public half, take its algorithm from it, and return a signer. */
export function createAwsKmsSigner(options: AwsKmsSignerOptions): Promise<AwsKmsSigner>
{
    return AwsKmsSigner.create(options);
}
