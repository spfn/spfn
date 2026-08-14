/**
 * @spfn/auth - Verified-Email Signup Service
 *
 * A signup where the address is proven before a password exists:
 *
 *   request  -> a one-time link is emailed
 *   confirm  -> the link is exchanged for a short-lived password-setup session
 *   password -> the account is created, the device registered, the user signed in
 *
 * The link token and the setup secret are bearer credentials, so neither is ever
 * stored. Only their SHA-256 hashes are, and lookup is by hash. A database dump
 * therefore yields nothing that can be presented to either step.
 *
 * The six-digit-code registration path is untouched and remains the default; this
 * is a second entry point to the same account creation, not a replacement.
 */

import crypto from 'crypto';
import { env } from '@spfn/auth/config';
import { InvalidSignupLinkError, InvalidSignupSetupSessionError } from '@spfn/auth/errors';
import { sendEmail } from '@spfn/notification/server';
import { authLogger } from '../logger';
import { signupLinkTokensRepository, usersRepository } from '../repositories';
import type { SignupLinkToken } from '../entities/signup-link-tokens';
import { noticeAccountExistsOnce } from './verification.service';
import { createVerifiedAccount } from './auth.service';
import type { RegisterResult } from './auth.service';
import type { KeyAlgorithmType, KeyPlatformType } from '../types';

/**
 * Bytes of entropy in the link token and the setup secret.
 *
 * 32 bytes is why neither credential carries an attempt counter the way a
 * six-digit code does: there is nothing to brute force. Rate limits here bound
 * request volume and mail sending, not guessing.
 */
const CREDENTIAL_BYTES = 32;

/**
 * Mint a bearer credential and the value stored for it.
 *
 * The secret is returned once, to be emailed or set as a cookie, and is then
 * unrecoverable — only `hash` reaches the database.
 */
function mintCredential(): { secret: string; hash: string }
{
    const secret = crypto.randomBytes(CREDENTIAL_BYTES).toString('base64url');

    return { secret, hash: hashCredential(secret) };
}

/**
 * Hash a presented credential the same way it was stored.
 *
 * SHA-256 without a salt or a work factor, deliberately: the input is 32 random
 * bytes rather than a human-chosen secret, so there is no dictionary to slow
 * down, and lookup has to be a plain equality match on an indexed column.
 */
function hashCredential(secret: string): string
{
    return crypto.createHash('sha256').update(secret).digest('base64url');
}

/**
 * Whether a return path can be handed back to the browser.
 *
 * Only a path within the app is allowed. The rejected shapes are the ones that
 * turn a return path into an open redirect: an absolute URL, a protocol-relative
 * `//host` that a browser reads as another origin, a backslash that some
 * browsers normalize into a slash, and any `..` traversal.
 */
export function isSafeReturnPath(returnPath: string): boolean
{
    if (!returnPath.startsWith('/'))
    {
        return false;
    }

    if (returnPath.startsWith('//') || returnPath.includes('\\'))
    {
        return false;
    }

    if (returnPath.includes('..'))
    {
        return false;
    }

    // A path cannot carry a protocol prefix; `/\thttps:` and friends are caught
    // above, this catches `/foo:bar` forms that some parsers read as an authority.
    return !/^\/[^/?#]*:/.test(returnPath);
}

/**
 * Absolute URL of the app page the confirmation link opens.
 */
function buildConfirmUrl(token: string): string
{
    const appUrl = (env.NEXT_PUBLIC_SPFN_APP_URL || env.SPFN_APP_URL || '').replace(/\/$/, '');
    const path = env.SPFN_AUTH_SIGNUP_CONFIRM_PATH || '/signup/confirm';

    return `${appUrl}${path}?token=${encodeURIComponent(token)}`;
}

async function sendSignupLinkEmail(
    email: string,
    confirmUrl: string,
    expiresInMinutes: number,
): Promise<void>
{
    const result = await sendEmail({
        to: email,
        template: 'signup-link',
        data: { confirmUrl, expiresInMinutes },
    });

    if (!result.success)
    {
        authLogger.email.error('Failed to send signup link email', {
            email,
            error: result.error,
        });
    }
}

export interface RequestSignupLinkParams
{
    email: string;
    returnPath?: string;
}

export interface RequestSignupLinkResult
{
    success: boolean;
    expiresAt: string;
}

/**
 * Step 1 — issue a confirmation link for an address.
 *
 * Answers identically whether or not the address already has an account. When it
 * does, the owner gets a notice instead of a usable link, through the same
 * dedupe window the six-digit-code path uses.
 *
 * Requesting again is how a resend works: every live link for the address is
 * superseded first, so the newest link is the only one that opens, and any setup
 * session already opened from an older link dies with it.
 */
export async function requestSignupLinkService(
    params: RequestSignupLinkParams,
): Promise<RequestSignupLinkResult>
{
    const email = params.email.trim();
    const returnPath = params.returnPath;
    const ttlMinutes = env.SPFN_AUTH_SIGNUP_LINK_TTL_MINUTES ?? 30;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

    const existingUser = await usersRepository.findByEmail(email);

    if (existingUser)
    {
        await noticeAccountExistsOnce(email, 'email');

        // Same shape, same fields, same expiry arithmetic as the branch below —
        // the two cases must be indistinguishable to the caller.
        return { success: true, expiresAt: expiresAt.toISOString() };
    }

    await signupLinkTokensRepository.supersedeLiveForEmail(email);

    const { secret, hash } = mintCredential();

    await signupLinkTokensRepository.create({
        email,
        tokenHash: hash,
        returnPath: returnPath ?? null,
        expiresAt,
    });

    await sendSignupLinkEmail(email, buildConfirmUrl(secret), ttlMinutes);

    return { success: true, expiresAt: expiresAt.toISOString() };
}

/**
 * Why a presented link cannot be used, or null if it can.
 *
 * The caller turns every reason into one generic refusal; the reason exists for
 * the log.
 */
function linkRefusalReason(row: SignupLinkToken | null): string | null
{
    if (!row)
    {
        return 'unknown token';
    }

    if (row.completedAt)
    {
        return 'signup already completed';
    }

    if (row.supersededAt)
    {
        return 'superseded by a newer request';
    }

    if (row.consumedAt)
    {
        return 'link already used';
    }

    if (new Date() > new Date(row.expiresAt))
    {
        return 'link expired';
    }

    return null;
}

export interface ConfirmSignupLinkParams
{
    token: string;
}

export interface ConfirmSignupLinkResult
{
    email: string;
    returnPath: string | null;
    /** Handed to the proxy interceptor, which moves it into an HttpOnly cookie. */
    setupSecret: string;
    setupExpiresAt: string;
}

/**
 * Step 2 — exchange a link for a password-setup session.
 *
 * Nothing binds the row to a device or a browser, which is what lets someone
 * request the link on a laptop and open it on a phone.
 */
export async function confirmSignupLinkService(
    params: ConfirmSignupLinkParams,
): Promise<ConfirmSignupLinkResult>
{
    const row = await signupLinkTokensRepository.findByTokenHash(hashCredential(params.token));
    const refusal = linkRefusalReason(row);

    if (refusal || !row)
    {
        authLogger.service.warn('Signup link refused', { reason: refusal });

        throw new InvalidSignupLinkError();
    }

    // Between issuing the link and opening it, the address may have gained an
    // account through another path. Letting the link through here would hand a
    // password-setup session for an address that is already owned.
    if (await usersRepository.findByEmail(row.email))
    {
        authLogger.service.warn('Signup link refused', { reason: 'account created meanwhile' });

        throw new InvalidSignupLinkError();
    }

    const setupTtlMinutes = env.SPFN_AUTH_SIGNUP_SETUP_TTL_MINUTES ?? 15;
    const setupExpiresAt = new Date(Date.now() + setupTtlMinutes * 60_000);
    const setup = mintCredential();

    // Conditional update: two confirms racing on one link produce one winner.
    const claimed = await signupLinkTokensRepository.claimLink(row.id, setup.hash, setupExpiresAt);

    if (!claimed)
    {
        authLogger.service.warn('Signup link refused', { reason: 'lost the claim race' });

        throw new InvalidSignupLinkError();
    }

    return {
        email: claimed.email,
        returnPath: claimed.returnPath,
        setupSecret: setup.secret,
        setupExpiresAt: setupExpiresAt.toISOString(),
    };
}

export interface CompleteSignupParams
{
    setupSecret?: string;
    password: string;
    publicKey: string;
    keyId: string;
    fingerprint: string;
    algorithm?: KeyAlgorithmType;
    deviceName?: string;
    platform?: KeyPlatformType;
    metadata?: Record<string, unknown>;
}

/**
 * Why a presented setup session cannot be used, or null if it can.
 */
function setupRefusalReason(row: SignupLinkToken | null): string | null
{
    if (!row)
    {
        return 'unknown setup session';
    }

    if (row.completedAt)
    {
        return 'setup session already used';
    }

    if (row.supersededAt)
    {
        return 'superseded by a newer request';
    }

    if (!row.setupExpiresAt || new Date() > new Date(row.setupExpiresAt))
    {
        return 'setup session expired';
    }

    return null;
}

/**
 * Step 3 — set the password, which is what creates the account.
 *
 * Run under `Transactional()`: the user row, the device key and the completion
 * mark commit together. A device-key failure must not leave an account nobody
 * can sign into, and a completion mark must not survive a rolled-back account.
 *
 * A refusal that is the user's to fix — a weak password, an app policy that
 * rejects the registration — leaves the setup session usable, so the fix is
 * retyping the password rather than requesting a fresh email.
 */
export async function completeSignupService(
    params: CompleteSignupParams,
): Promise<RegisterResult>
{
    if (!params.setupSecret)
    {
        throw new InvalidSignupSetupSessionError();
    }

    const row = await signupLinkTokensRepository.findBySetupSecretHash(hashCredential(params.setupSecret));
    const refusal = setupRefusalReason(row);

    if (refusal || !row)
    {
        authLogger.service.warn('Signup setup session refused', { reason: refusal });

        throw new InvalidSignupSetupSessionError();
    }

    // Claim first: the mark is what makes this session one-time, and claiming
    // before creating the account means two concurrent submits cannot both reach
    // account creation. The transaction rolls the mark back with everything else
    // if creation then fails, which is what keeps a rejected password retryable.
    const claimed = await signupLinkTokensRepository.claimSetupSession(row.id);

    if (!claimed)
    {
        authLogger.service.warn('Signup setup session refused', { reason: 'lost the claim race' });

        throw new InvalidSignupSetupSessionError();
    }

    return await createVerifiedAccount({
        email: claimed.email,
        password: params.password,
        publicKey: params.publicKey,
        keyId: params.keyId,
        fingerprint: params.fingerprint,
        algorithm: params.algorithm,
        deviceName: params.deviceName,
        platform: params.platform,
        metadata: params.metadata,
    });
}
