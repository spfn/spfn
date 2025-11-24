/**
 * @spfn/auth - Auth Routes
 *
 * Thin route handlers that delegate to services
 */

import { EmailSchema, PhoneSchema, PasswordSchema, TargetTypeSchema, VerificationPurposeSchema } from "../schema";
import { getAuth, getUser } from '../../helpers';
import { KEY_ALGORITHM } from '../../types';
import {
    changePasswordService,
    checkAccountExistsService,
    loginService,
    logoutService,
    registerService,
    rotateKeyService,
    sendVerificationCodeService,
    verifyCodeService,
    getAuthSessionService
} from '../../services';
import { Type } from '@sinclair/typebox';
import { Transactional } from '@spfn/core/db';
import { defineRouter, route } from '@spfn/core/route';

/**
 * POST /_auth/exists - Check if account exists
 * Checks if an email or phone number is already registered
 */
export const checkAccountExists = route.post('/_auth/exists')
    .input({
        body: Type.Object(
            {
                email: Type.Optional(EmailSchema),
                phone: Type.Optional(PhoneSchema),
            },
            {
                minProperties: 1,
                description: 'At least one of email or phone must be provided'
            }
        )
    })
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { body } = await c.data();
        return await checkAccountExistsService(body)
    });

/**
 * POST /_auth/codes - Send verification code
 * Sends a 6-digit verification code to email or phone
 */
export const sendVerificationCode = route.post('/_auth/codes')
    .input({
        body: Type.Object({
            target: Type.String({
                description: 'Email address or phone number in E.164 format'
            }),
            targetType: TargetTypeSchema,
            purpose: VerificationPurposeSchema,
        })
    })
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { body } = await c.data();
        return await sendVerificationCodeService(body)
    });

/**
 * POST /_auth/codes/verify - Verify code (without creating account)
 * Validates verification code, returns a temporary token
 */
export const verifyCode = route.post('/_auth/codes/verify')
    .input({
        body: Type.Object({
            target: Type.String({
                description: 'Email address or phone number'
            }),
            targetType: TargetTypeSchema,
            code: Type.String({
                minLength: 6,
                maxLength: 6,
                pattern: '^[0-9]{6}$',
                description: '6-digit verification code'
            }),
            purpose: VerificationPurposeSchema,
        })
    })
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { body } = await c.data();
        return await verifyCodeService(body)
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
                description: 'Verification token obtained from /verify-code endpoint'
            }),
            password: PasswordSchema,
        }, {
            minProperties: 3, // email/phone + verificationToken + password
            description: 'Email or phone must be provided with verification token'
        })
    })
    .interceptor({
        body: Type.Object({
            publicKey: Type.String({ description: 'Client public key' }),
            keyId: Type.String({ description: 'Key identifier' }),
            fingerprint: Type.String({ description: 'Key fingerprint' }),
            algorithm: Type.Union(KEY_ALGORITHM.map(algo => Type.Literal(algo)), { description: 'Signature algorithm' }),
        })
    })
    .use([Transactional()])
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { body } = await c.data();
        return await registerService(body)
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
                description: 'User password'
            }),
        }, {
            minProperties: 2, // email/phone + password
            description: 'Email or phone must be provided with password'
        })
    })
    .interceptor({
        body: Type.Object({
            publicKey: Type.String({ description: 'Client public key' }),
            keyId: Type.String({ description: 'Key identifier' }),
            fingerprint: Type.String({ description: 'Key fingerprint' }),
            algorithm: Type.Union(KEY_ALGORITHM.map(algo => Type.Literal(algo)), { description: 'Signature algorithm' }),
            oldKeyId: Type.Optional(Type.String({ description: 'Previous key ID for rotation' })),
        })
    })
    .use([Transactional()])
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { body } = await c.data();
        return await loginService(body)
    });

// ===== Authenticated Routes Below =====

/**
 * POST /_auth/logout - Logout user
 * Revokes current key (requires authentication)
 */
export const logout = route.post('/_auth/logout')
    .input({
        body: Type.Object({})
    })
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
    .input({
        body: Type.Object({})
    })
    .interceptor({
        body: Type.Object({
            publicKey: Type.String({ description: 'New public key' }),
            keyId: Type.String({ description: 'New key identifier' }),
            fingerprint: Type.String({ description: 'New key fingerprint' }),
            algorithm: Type.Union(KEY_ALGORITHM.map(algo => Type.Literal(algo)), { description: 'Signature algorithm' }),
        })
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
        })
    });

/**
 * PUT /_auth/password - Change user password
 * Allows authenticated users to change their password
 * Requires current password for verification
 */
export const changePassword = route.put('/_auth/password')
    .input({
        body: Type.Object({
            currentPassword: Type.String({
                minLength: 1,
                description: 'Current password for verification'
            }),
            newPassword: PasswordSchema,
        })
    })
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
        return await getAuthSessionService(userId)
    });

// Export router
export const authRouter = defineRouter({
    checkAccountExists: checkAccountExists,
    sendVerificationCode: sendVerificationCode,
    verifyCode: verifyCode,
    register: register,
    login: login,
    logout: logout,
    rotateKey: rotateKey,
    changePassword: changePassword,
    getAuthSession: getAuthSession,
});

// For backward compatibility with file-based routing (temporary)
export default authRouter;