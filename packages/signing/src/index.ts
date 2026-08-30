/**
 * `@spfn/signing` — one `Signer` interface, three key providers, one token
 * format.
 *
 * ```ts
 * import { createSigner, KeyRing } from '@spfn/signing';
 *
 * const signer = await createSigner({
 *     provider: 'local',
 *     kid: 'bridge-2026-08',
 *     alg: 'EdDSA',                                  // the default; ES256 is the other
 *     privateKey: { env: 'SPFN_BRIDGE_SIGNING_KEY' },
 * });
 *
 * const token = await signer.sign({ sub: tenantId, ...timeClaims({ ttlSec: 300 }) });
 * ```
 *
 * The verifier lives at `@spfn/signing/verify` and depends on nothing but
 * `node:crypto`. Import it from there, not from here, wherever the code that
 * checks tokens is not the code that issues them.
 *
 * Neither KMS SDK is imported by this module. They are optional peer
 * dependencies, loaded on demand inside their own provider, so this package
 * installs and runs with neither of them present.
 */

import { LocalSigner, type LocalSignerOptions } from './providers/local';
import type { AwsKmsSignerOptions } from './providers/aws-kms';
import type { GcpKmsSignerOptions } from './providers/gcp-kms';
import type { Signer } from './types';

export {
    CompactSigner,
    derSignatureToJose,
    joseSignatureBytes,
    signCompact,
    timeClaims,
    withTimeClaims,
} from './jws';
export type { TimeClaimOptions } from './jws';
export { KeyRing } from './ring';
export type { KeyRingOptions } from './ring';
export { rotate, rotationStage, shouldRotate } from './rotation';
export type { RotationPlan, RotationStage } from './rotation';
export { generateLocalKeyPair, LocalSigner } from './providers/local';
export type { LocalKeyMaterial, LocalSignerOptions } from './providers/local';
export type {
    AwsKmsClient,
    AwsKmsSigner,
    AwsKmsSignerOptions,
    AwsSigningAlgorithm,
} from './providers/aws-kms';
export type { GcpKmsClient, GcpKmsSigner, GcpKmsSignerOptions } from './providers/gcp-kms';
export type { RawSigner, SignOptions, Signer } from './types';

// The whole verify-only surface — parseCompact, verifyJws, the key formats
// and every shared type — so an issuer needs one import, not two.
export * from './verify';

/** What `createSigner()` takes, one member per provider. */
export type SignerConfig =
    | ({ provider: 'local' } & LocalSignerOptions)
    | ({ provider: 'gcp-kms' } & GcpKmsSignerOptions)
    | ({ provider: 'aws-kms' } & AwsKmsSignerOptions);

/**
 * Build the signer a configuration names.
 *
 * Asynchronous for every provider: a KMS signer has to read its key's
 * algorithm and public half before it can claim to be one.
 */
export async function createSigner(config: SignerConfig): Promise<Signer>
{
    if (config.provider === 'local')
    {
        return new LocalSigner(config);
    }

    if (config.provider === 'gcp-kms')
    {
        const { createGcpKmsSigner } = await import('./providers/gcp-kms');

        return createGcpKmsSigner(config);
    }

    const { createAwsKmsSigner } = await import('./providers/aws-kms');

    return createAwsKmsSigner(config);
}
