/**
 * @spfn/auth - Auth Routes
 *
 * Thin route handlers that delegate to services
 */

import {
    EmailSchema, PhoneSchema, PasswordSchema, TargetTypeSchema, VerificationPurposeSchema,
    DeviceNameSchema, PlatformSchema,
} from '../schema';
import { getAuth, getUser } from '../../helpers';
import { KEY_ALGORITHM } from '../../types';
import { KeyNotFoundError } from '@spfn/auth/errors';
import { ValidationError } from '@spfn/core/errors';
import {
    changePasswordService,
    loginService,
    logoutService,
    registerService,
    rotateKeyService,
    listKeysService,
    revokeKeyService,
    revokeAllKeysService,
    sendVerificationCodeService,
    verifyCodeService,
    getAuthSessionService,
    issueOneTimeTokenService,
    requestSignupLinkService,
    confirmSignupLinkService,
    completeSignupService,
    isSafeReturnPath,
} from '../../services';
import { Type } from '@sinclair/typebox';
import { Transactional } from '@spfn/core/db';
import { rateLimitPolicy } from '@spfn/core/middleware';
import { byIpAndAccount, byIpAndTarget } from '../../lib/rate-limit-keys';
import { defineRouter, route } from '@spfn/core/route';

// NOTE: a POST /_auth/exists endpoint was removed deliberately — it answered
// account existence directly (user enumeration). Existence is no longer exposed;
// the login path is also timing-equalized (see loginService). Don't reintroduce
// an existence check without revisiting that posture.

/**
 * POST /_auth/codes - Send verification code
 * Sends a 6-digit verification code to email or phone
 */
export const sendVerificationCode = route.post('/_auth/codes')
    .input({
        body: Type.Object({
            target: Type.String({
                description: 'Email address or phone number in E.164 format',
            }),
            targetType: TargetTypeSchema,
            purpose: VerificationPurposeSchema,
        }),
    })
    .use([rateLimitPolicy('auth-code-send', { limit: 5, windowMs: 60_000, by: byIpAndTarget({ ipLimit: 20 }) })])
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { body } = await c.data();

        return await sendVerificationCodeService(body);
    });

/**
 * POST /_auth/codes/verify - Verify code (without creating account)
 * Validates verification code, returns a temporary token
 */
export const verifyCode = route.post('/_auth/codes/verify')
    .input({
        body: Type.Object({
            target: Type.String({
                description: 'Email address or phone number',
            }),
            targetType: TargetTypeSchema,
            code: Type.String({
                minLength: 6,
                maxLength: 6,
                pattern: '^[0-9]{6}$',
                description: '6-digit verification code',
            }),
            purpose: VerificationPurposeSchema,
        }),
    })
    .use([rateLimitPolicy('auth-code-verify', { limit: 10, windowMs: 60_000, by: byIpAndTarget({ ipLimit: 50 }) })])
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { body } = await c.data();

        return await verifyCodeService(body);
    });

/**
 * POST /_auth/register - Register new user
 * Register with email/phone and password, includes public key
 */
export const register = route.post('/_auth/register')
    .input({
        body: Type.Object({
            email: Type.Optional(EmailSchema),
            phone: Type.Optional(PhoneSchema),
            verificationToken: Type.String({
                description: 'Verification token obtained from /verify-code endpoint',
            }),
            password: PasswordSchema,
            metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown(), {
                description: 'Custom metadata passed to authRegisterEvent (e.g. referral code, UTM params)',
            })),
        }, {
            minProperties: 3, // email/phone + verificationToken + password
            description: 'Email or phone must be provided with verification token',
        }),
    })
    .interceptor({
        body: Type.Object({
            publicKey: Type.String({ description: 'Client public key' }),
            keyId: Type.String({ description: 'Key identifier' }),
            fingerprint: Type.String({ description: 'Key fingerprint' }),
            algorithm: Type.Union(KEY_ALGORITHM.map(algo => Type.Literal(algo)), { description: 'Signature algorithm' }),
            deviceName: Type.Optional(DeviceNameSchema),
            platform: Type.Optional(PlatformSchema),
        }),
    })
    .use([rateLimitPolicy('auth-register', { limit: 10, windowMs: 60_000, by: byIpAndAccount({ ipLimit: 100 }) }), Transactional()])
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { body } = await c.data();

        return await registerService(body);
    });

/**
 * POST /_auth/signup/email - Request a verified-email signup link
 *
 * Emails a one-time confirmation link. Answers identically whether or not the
 * address already has an account, so it cannot be used to probe for accounts.
 * Calling it again is the resend: it supersedes every live link for the address.
 */
export const requestSignupLink = route.post('/_auth/signup/email')
    .input({
        body: Type.Object({
            email: EmailSchema,
            returnPath: Type.Optional(Type.String({
                maxLength: 512,
                description: 'Relative path within the app to return to after signup. Absolute URLs are rejected.',
            })),
        }),
    })
    // byIpAndAccount, not byIpAndTarget: the account dimension is read from
    // `body.email`, and byIpAndTarget looks for `body.target` — which this route
    // does not have, so it would silently degrade to an IP-only limit.
    .use([rateLimitPolicy('auth-signup-link', { limit: 5, windowMs: 60_000, by: byIpAndAccount({ ipLimit: 20 }) })])
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { body } = await c.data();

        if (body.returnPath !== undefined && !isSafeReturnPath(body.returnPath))
        {
            throw new ValidationError({ message: 'returnPath must be a relative path within the app' });
        }

        return await requestSignupLinkService(body);
    });

/**
 * POST /_auth/signup/email/confirm - Exchange a signup link for a setup session
 *
 * The emailed link opens an app page; that page posts the token here. The
 * response carries `setupSecret`, which the Next.js proxy interceptor moves into
 * an HttpOnly cookie and strips from the body — so it never reaches page script.
 */
export const confirmSignupLink = route.post('/_auth/signup/email/confirm')
    .input({
        body: Type.Object({
            token: Type.String({
                minLength: 16,
                maxLength: 256,
                description: 'Token from the confirmation link',
            }),
        }),
    })
    .use([rateLimitPolicy('auth-signup-confirm', { limit: 10, windowMs: 60_000 })])
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { body } = await c.data();

        return await confirmSignupLinkService(body);
    });

/**
 * POST /_auth/signup/password - Set the password, which creates the account
 *
 * Authorized by the setup-session cookie, not by a session: the interceptor
 * reads that cookie into `setupSecret` and injects the device key the same way
 * it does for register. Creating the user, registering the key and marking the
 * setup session used all commit together.
 */
export const completeSignup = route.post('/_auth/signup/password')
    .input({
        body: Type.Object({
            password: PasswordSchema,
            metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown(), {
                description: 'Custom metadata passed to authRegisterEvent (e.g. referral code, UTM params)',
            })),
        }),
    })
    .interceptor({
        body: Type.Object({
            setupSecret: Type.String({ description: 'Password-setup session secret, from the HttpOnly cookie' }),
            publicKey: Type.String({ description: 'Client public key' }),
            keyId: Type.String({ description: 'Key identifier' }),
            fingerprint: Type.String({ description: 'Key fingerprint' }),
            algorithm: Type.Union(KEY_ALGORITHM.map(algo => Type.Literal(algo)), { description: 'Signature algorithm' }),
            deviceName: Type.Optional(DeviceNameSchema),
            platform: Type.Optional(PlatformSchema),
        }),
    })
    .use([rateLimitPolicy('auth-signup-password', { limit: 10, windowMs: 60_000 }), Transactional()])
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { body } = await c.data();

        return await completeSignupService(body);
    });

/**
 * POST /_auth/login - User login
 * Authenticate user with email/phone and password
 * Replaces existing key with new one
 */
export const login = route.post('/_auth/login')
    .input({
        body: Type.Object({
            email: Type.Optional(EmailSchema),
            phone: Type.Optional(PhoneSchema),
            password: Type.String({
                minLength: 1,
                description: 'User password',
            }),
        }, {
            minProperties: 2, // email/phone + password
            description: 'Email or phone must be provided with password',
        }),
    })
    .interceptor({
        body: Type.Object({
            publicKey: Type.String({ description: 'Client public key' }),
            keyId: Type.String({ description: 'Key identifier' }),
            fingerprint: Type.String({ description: 'Key fingerprint' }),
            algorithm: Type.Union(KEY_ALGORITHM.map(algo => Type.Literal(algo)), { description: 'Signature algorithm' }),
            oldKeyId: Type.Optional(Type.String({ description: 'Previous key ID for rotation' })),
            deviceName: Type.Optional(DeviceNameSchema),
            platform: Type.Optional(PlatformSchema),
        }),
    })
    .use([rateLimitPolicy('auth-login', { limit: 10, windowMs: 60_000, by: byIpAndAccount({ ipLimit: 100 }) }), Transactional()])
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { body } = await c.data();

        return await loginService(body);
    });

// ===== Authenticated Routes Below =====

/**
 * POST /_auth/logout - Logout user
 * Revokes current key (requires authentication)
 */
export const logout = route.post('/_auth/logout')
    .handler(async (c) =>
    {
        const auth = getAuth(c);

        // If no auth (expired/invalid session), logout is still considered successful
        if (!auth)
        {
            return c.noContent();
        }

        const { keyId, userId } = auth;
        await logoutService({ userId: Number(userId), keyId });

        return c.noContent();
    });

/**
 * POST /_auth/keys/rotate - Rotate key
 * Replace current key with new one (requires authentication)
 */
export const rotateKey = route.post('/_auth/keys/rotate')
    .interceptor({
        body: Type.Object({
            publicKey: Type.String({ description: 'New public key' }),
            keyId: Type.String({ description: 'New key identifier' }),
            fingerprint: Type.String({ description: 'New key fingerprint' }),
            algorithm: Type.Union(KEY_ALGORITHM.map(algo => Type.Literal(algo)), { description: 'Signature algorithm' }),
            deviceName: Type.Optional(DeviceNameSchema),
            platform: Type.Optional(PlatformSchema),
        }),
    })
    .use([Transactional()])
    .handler(async (c) =>
    {
        const { body } = await c.data();
        const { keyId: oldKeyId, userId } = getAuth(c);

        return await rotateKeyService({
            userId: Number(userId),
            oldKeyId,
            newKeyId: body.keyId,
            newPublicKey: body.publicKey,
            fingerprint: body.fingerprint,
            algorithm: body.algorithm,
            deviceName: body.deviceName,
            platform: body.platform,
        });
    });

/**
 * POST /_auth/keys/list - List the caller's registered devices
 *
 * POST rather than GET, and the identifier in the body rather than the path, because
 * clientProofV1 signs the request body: a GET has no body to sign, and a value in the
 * path has no canonicalization rule the way the body does (`canonical-json`), so client
 * and server could disagree on the signed string over percent-encoding alone. Every
 * operation in the mobile contract is shaped this way.
 *
 * The public key itself never leaves the server and the fingerprint is truncated: the
 * list exists to recognise a device and point at it, and neither value serves that.
 */
export const listKeys = route.post('/_auth/keys/list')
    .input({
        body: Type.Object({
            includeRevoked: Type.Optional(Type.Boolean({
                description: 'Also return keys already revoked, for reviewing what was cut off. Default false.',
            })),
        }),
    })
    .handler(async (c) =>
    {
        const { body } = await c.data();
        const { userId } = getAuth(c);

        return { keys: await listKeysService({ userId: Number(userId), includeRevoked: body.includeRevoked }) };
    });

/**
 * POST /_auth/keys/revoke - Sign one device out
 *
 * Revoking the key the request itself is signed with is allowed — it is this device's
 * own sign-out, which `POST /_auth/logout` already does. The response says which
 * happened so a client can tell "that other phone is gone" from "I just signed myself out".
 */
export const revokeKey = route.post('/_auth/keys/revoke')
    .input({
        body: Type.Object({
            keyId: Type.String({ description: 'Key to revoke — must belong to the caller' }),
        }),
    })
    .use([Transactional()])
    .handler(async (c) =>
    {
        const { body } = await c.data();
        const { userId, keyId: currentKeyId } = getAuth(c);

        const revoked = await revokeKeyService({
            userId: Number(userId),
            keyId: body.keyId,
            reason: 'Revoked by user',
        });

        if (!revoked)
        {
            throw new KeyNotFoundError();
        }

        return { keyId: body.keyId, selfRevoked: body.keyId === currentKeyId };
    });

/**
 * POST /_auth/keys/revoke-all - Sign every device out
 *
 * Spares the calling device by default, so this is "sign out my other devices".
 * `includeCurrent: true` is the full sign-out — until now reachable only as a
 * side effect of changing a password, which nobody does for that reason.
 */
export const revokeAllKeys = route.post('/_auth/keys/revoke-all')
    .input({
        body: Type.Object({
            includeCurrent: Type.Optional(Type.Boolean({
                description: 'Also revoke the key this request is signed with. Default false.',
            })),
        }),
    })
    .use([Transactional()])
    .handler(async (c) =>
    {
        const { body } = await c.data();
        const { userId, keyId } = getAuth(c);

        return await revokeAllKeysService({
            userId: Number(userId),
            currentKeyId: keyId,
            includeCurrent: body.includeCurrent,
            reason: 'Revoked by user',
        });
    });

/**
 * PUT /_auth/password - Change user password
 * Allows authenticated users to change their password
 * Requires current password for verification
 */
export const changePassword = route.put('/_auth/password')
    .input({
        body: Type.Object({
            currentPassword: Type.Optional(Type.String({
                minLength: 1,
                description: 'Current password for verification (required when changing existing password)',
            })),
            newPassword: PasswordSchema,
        }),
    })
    .use([rateLimitPolicy('auth-password-change', { limit: 10, windowMs: 60_000 })])
    .handler(async (c) =>
    {
        const { body } = await c.data();
        const user = getUser(c);

        await changePasswordService({
            userId: user.id,
            currentPassword: body.currentPassword,
            newPassword: body.newPassword,
            passwordHash: user.passwordHash || undefined,
        });

        return c.noContent();
    });

/**
 * GET /_auth/session - Get authentication session
 * Returns authentication and authorization information including:
 * - Minimal user info (id, email, verification status)
 * - Role
 * - Permissions
 *
 * Lightweight endpoint for auth checks and guards
 * Does not include profile data
 *
 * Requires authentication
 */
export const getAuthSession = route.get('/_auth/session')
    .handler(async (c) =>
    {
        const { userId } = getAuth(c);

        return await getAuthSessionService(userId);
    });

/**
 * POST /_auth/tokens - Issue a one-time token
 * Returns a single-use token for direct API access (file uploads, SSE, etc.)
 *
 * Requires authentication
 */
export const issueOneTimeToken = route.post('/_auth/tokens')
    .handler(async (c) =>
    {
        const { userId } = getAuth(c);

        return await issueOneTimeTokenService(userId);
    });

// Export router
export const authRouter = defineRouter({
    sendVerificationCode: sendVerificationCode,
    verifyCode: verifyCode,
    register: register,
    login: login,
    logout: logout,
    rotateKey: rotateKey,
    listKeys: listKeys,
    revokeKey: revokeKey,
    revokeAllKeys: revokeAllKeys,
    changePassword: changePassword,
    getAuthSession: getAuthSession,
    issueOneTimeToken: issueOneTimeToken,
});

// For backward compatibility with file-based routing (temporary)
export default authRouter;
