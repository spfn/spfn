/**
 * @spfn/auth - Auth API Contracts
 *
 * Type-safe API contracts for authentication operations
 */

import { AuthSessionSchema } from "@/lib/contracts/schemas/auth-session";
import {
    EmailSchema,
    PhoneSchema,
    TargetTypeSchema,
    VerificationPurposeSchema,
    VerificationCodeSchema,
    KeyIdSchema,
    PasswordSchema,
    CryptoKeyFieldsSchema
} from "@/lib/contracts/schemas/base";
import { Type } from '@sinclair/typebox';
import { ApiResponseSchema, defineContract } from '@spfn/core/route/types';

// ===== API Contracts =====

/**
 * POST /codes - Send verification code
 *
 * Sends a 6-digit verification code to email or phone
 * Final path: /_auth/codes
 */
export const sendVerificationCodeContract = defineContract({
    method: 'POST',
    path: '/_auth/codes',
    body: Type.Object({
        target: Type.String({
            description: 'Email address or phone number in E.164 format'
        }),
        targetType: TargetTypeSchema,
        purpose: VerificationPurposeSchema,
    }),
    response: ApiResponseSchema(
        Type.Object({
            success: Type.Boolean(),
            expiresAt: Type.String({ description: 'ISO 8601 expiry time' }),
        })
    ),
    meta: {
        skipMiddlewares: ['auth']
    }
});

/**
 * POST /codes/verify - Verify code (without creating account)
 *
 * Validates verification code, returns a temporary token
 * Final path: /_auth/codes/verify
 */
export const verifyCodeContract = defineContract({
    method: 'POST',
    path: '/_auth/codes/verify',
    body: Type.Object({
        target: Type.String({
            description: 'Email address or phone number'
        }),
        targetType: TargetTypeSchema,
        code: VerificationCodeSchema,
        purpose: VerificationPurposeSchema,
    }),
    response: ApiResponseSchema(
        Type.Object({
            valid: Type.Boolean(),
            verificationToken: Type.Optional(Type.String({
                description: 'Temporary token for completing registration (15min validity)'
            })),
        })
    ),
    meta: {
        skipMiddlewares: ['auth']
    }
});

/**
 * POST /exists - Check if account exists
 *
 * Checks if an email or phone number is already registered
 * Final path: /_auth/exists (prefix added from package.json)
 */
export const checkAccountExistsContract = defineContract({
    method: 'POST',
    path: '/_auth/exists',
    body: Type.Object(
        {
            email: Type.Optional(EmailSchema),
            phone: Type.Optional(PhoneSchema),
        },
        {
            minProperties: 1,
            description: 'At least one of email or phone must be provided'
        }
    ),
    response: ApiResponseSchema(
        Type.Object({
            exists: Type.Boolean({ description: 'Whether the account exists' }),
            identifier: Type.String({ description: 'The identifier that was checked' }),
            identifierType: TargetTypeSchema,
        })
    ),
    meta: {
        skipMiddlewares: ['auth']
    }
});

/**
 * POST /register - Register new user
 *
 * Register with email/phone and password, includes public key
 * Final path: /_auth/register (prefix added from package.json)
 */
export const registerContract = defineContract({
    method: 'POST',
    path: '/_auth/register',
    body: Type.Intersect([
        Type.Object({
            email: Type.Optional(EmailSchema),
            phone: Type.Optional(PhoneSchema),
            verificationToken: Type.String({
                description: 'Verification token obtained from /verify-code endpoint'
            }),
            password: PasswordSchema,
        }),
        CryptoKeyFieldsSchema
    ], {
        minProperties: 6, // email/phone + verificationToken + password + publicKey + keyId + fingerprint
        description: 'Email or phone must be provided with verification token'
    }),
    response: ApiResponseSchema(
        Type.Object({
            userId: Type.String(),
            email: Type.Optional(Type.String()),
            phone: Type.Optional(Type.String()),
        })
    ),
    meta: {
        skipMiddlewares: ['auth']
    }
});

/**
 * POST /login - User login
 *
 * Authenticate user with email/phone and password
 * Replaces existing key with new one
 * Final path: /_auth/login (prefix added from package.json)
 */
export const loginContract = defineContract({
    method: 'POST',
    path: '/_auth/login',
    body: Type.Intersect([
        Type.Object({
            email: Type.Optional(EmailSchema),
            phone: Type.Optional(PhoneSchema),
            password: Type.String({
                minLength: 1,
                description: 'User password'
            }),
            oldKeyId: Type.Optional(KeyIdSchema),
        }),
        CryptoKeyFieldsSchema
    ], {
        minProperties: 5, // email/phone + password + publicKey + keyId + fingerprint
        description: 'Email or phone must be provided along with key data'
    }),
    response: ApiResponseSchema(
        Type.Object({
            userId: Type.String(),
            email: Type.Optional(Type.String()),
            phone: Type.Optional(Type.String()),
            passwordChangeRequired: Type.Boolean({
                description: 'Whether user must change password before proceeding'
            }),
        })
    ),
    meta: {
        skipMiddlewares: ['auth']
    }
});

/**
 * POST /logout - Logout user
 *
 * Revokes current key (requires authentication)
 * Final path: /_auth/logout (prefix added from package.json)
 */
export const logoutContract = defineContract({
    method: 'POST',
    path: '/_auth/logout',
    body: Type.Object({}),
    response: ApiResponseSchema(
        Type.Object({
            success: Type.Boolean(),
        })
    ),
});

/**
 * POST /keys/rotate - Rotate key
 *
 * Replace current key with new one (requires authentication)
 * Final path: /_auth/keys/rotate (prefix added from package.json)
 */
export const rotateKeyContract = defineContract({
    method: 'POST',
    path: '/_auth/keys/rotate',
    body: CryptoKeyFieldsSchema,
    response: ApiResponseSchema(
        Type.Object({
            success: Type.Boolean(),
            keyId: Type.String(),
        })
    ),
});

/**
 * PUT /password - Change user password
 *
 * Allows authenticated users to change their password
 * Requires current password for verification
 * Final path: /_auth/password (prefix added from package.json)
 */
export const changePasswordContract = defineContract({
    method: 'PUT',
    path: '/_auth/password',
    body: Type.Object({
        currentPassword: Type.String({
            minLength: 1,
            description: 'Current password for verification'
        }),
        newPassword: PasswordSchema,
    }),
    response: ApiResponseSchema(
        Type.Object({
            success: Type.Boolean({ description: 'Whether password was changed successfully' }),
        })
    ),
});

/**
 * GET /session - Get authentication session
 *
 * Returns authentication and authorization information including:
 * - Minimal user info (id, email, verification status)
 * - Role
 * - Permissions
 *
 * Lightweight endpoint for auth checks and guards
 * Does not include profile data
 *
 * Requires authentication
 * Final path: /_auth/session (prefix added from package.json)
 */
export const getAuthSessionContract = defineContract({
    method: 'GET',
    path: '/_auth/session',
    response: ApiResponseSchema(AuthSessionSchema),
});