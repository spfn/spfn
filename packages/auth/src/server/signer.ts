/**
 * Request signing and verification utilities
 */

import crypto from 'node:crypto';

import type { SignatureData, SignatureResult } from '../shared/types.js';

import { DEFAULT_NONCE_WINDOW, ERROR_MESSAGES } from '../shared/constants.js';

/**
 * Sign a request using ECDSA (P-256 curve) with SHA-256
 *
 * @param data - Request data to sign
 * @param privateKey - Private key in DER format (base64 encoded)
 * @returns Signature and metadata
 */
export async function signRequest(
    data: Omit<SignatureData, 'timestamp' | 'nonce'>,
    privateKey: string
): Promise<SignatureResult>
{
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();

    const message = JSON.stringify({
        method: data.method,
        url: data.url,
        body: data.body,
        timestamp,
        nonce,
    });

    const keyObject = crypto.createPrivateKey({
        key: Buffer.from(privateKey, 'base64'),
        format: 'der',
        type: 'pkcs8',
    });

    const signer = crypto.createSign('SHA256');
    signer.update(message);
    signer.end();

    const signature = signer.sign(keyObject);

    return {
        signature: signature.toString('base64'),
        timestamp,
        nonce,
    };
}

/**
 * Verify a request signature using ECDSA (P-256 curve) with SHA-256
 *
 * @param data - Request data
 * @param signature - Signature to verify (base64 encoded)
 * @param publicKey - Public key in DER format (base64 encoded)
 * @param nonceWindow - Nonce validity window in seconds
 * @returns True if signature is valid
 * @throws Error if signature is invalid, expired, or replay attack detected
 */
export async function verifySignature(
    data: SignatureData,
    signature: string,
    publicKey: string,
    nonceWindow: number = DEFAULT_NONCE_WINDOW
): Promise<boolean>
{
    const now = Date.now();
    const requestTime = Number(data.timestamp);

    if (isNaN(requestTime))
    {
        throw new Error(ERROR_MESSAGES.INVALID_SIGNATURE);
    }

    if (now - requestTime > nonceWindow * 1000)
    {
        throw new Error(ERROR_MESSAGES.EXPIRED_REQUEST);
    }

    const message = JSON.stringify({
        method: data.method,
        url: data.url,
        body: data.body,
        timestamp: data.timestamp,
        nonce: data.nonce,
    });

    try
    {
        const keyObject = crypto.createPublicKey({
            key: Buffer.from(publicKey, 'base64'),
            format: 'der',
            type: 'spki',
        });

        const verifier = crypto.createVerify('SHA256');
        verifier.update(message);
        verifier.end();

        return verifier.verify(keyObject, Buffer.from(signature, 'base64'));
    }
    catch (error)
    {
        return false;
    }
}

/**
 * Extract signature headers from request
 *
 * @param headers - Request headers
 * @returns Signature data or null if missing
 */
export function extractSignatureHeaders(headers: { get(name: string): string | null }): {
    signature: string;
    timestamp: string;
    nonce: string;
    keyId: string;
} | null
{
    const signature = headers.get('X-Signature');
    const timestamp = headers.get('X-Timestamp');
    const nonce = headers.get('X-Nonce');
    const keyId = headers.get('X-Key-Id');

    if (!signature || !timestamp || !nonce || !keyId)
    {
        return null;
    }

    return { signature, timestamp, nonce, keyId };
}