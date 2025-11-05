/**
 * @spfn/auth - Auth API Contracts
 *
 * Type-safe API contracts for authentication operations
 */

import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';
import { ApiResponseSchema } from '@/lib/types/schemas';

// Email regex pattern (RFC 5322 compliant)
// Validates: local-part@domain.tld
// - Local part: alphanumeric, dots, hyphens, underscores
// - Domain: alphanumeric, hyphens, dots
// - TLD: minimum 2 characters
const EMAIL_PATTERN = '^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$';

// Phone regex pattern (E.164 format)
// Format: +[country code][number] (1-15 digits total)
const PHONE_PATTERN = '^\\+[1-9]\\d{1,14}$';

// SHA-256 fingerprint pattern (64 hex characters)
const FINGERPRINT_PATTERN = '^[a-f0-9]{64}$';

// UUID v4 pattern (8-4-4-4-12 format)
const UUID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

// Base64 pattern (DER encoded keys)
// Matches standard Base64 with padding
const BASE64_PATTERN = '^[A-Za-z0-9+/]+=*$';

/**
 * POST /codes - Send verification code
 *
 * Sends a 6-digit verification code to email or phone
 * Final path: /_auth/codes
 */
export const sendVerificationCodeContract = {
    method: 'POST' as const,
    path: '/_auth/codes',
    body: Type.Object({
        target: Type.String({
            description: 'Email address or phone number in E.164 format'
        }),
        targetType: Type.Union([
            Type.Literal('email'),
            Type.Literal('phone')
        ], {
            description: 'Type of target (email or phone)'
        }),
        purpose: Type.Union([
            Type.Literal('registration'),
            Type.Literal('login'),
            Type.Literal('password_reset')
        ], {
            description: 'Purpose of verification'
        }),
    }),
    response: ApiResponseSchema(
        Type.Object({
            success: Type.Boolean(),
            expiresAt: Type.String({ description: 'ISO 8601 expiry time' }),
        })
    ),
} as const satisfies RouteContract;

/**
 * POST /codes/verify - Verify code (without creating account)
 *
 * Validates verification code, returns a temporary token
 * Final path: /_auth/codes/verify
 */
export const verifyCodeContract = {
    method: 'POST' as const,
    path: '/_auth/codes/verify',
    body: Type.Object({
        target: Type.String({
            description: 'Email address or phone number'
        }),
        targetType: Type.Union([
            Type.Literal('email'),
            Type.Literal('phone')
        ]),
        code: Type.String({
            minLength: 6,
            maxLength: 6,
            pattern: '^[0-9]{6}$',
            description: '6-digit verification code'
        }),
        purpose: Type.Union([
            Type.Literal('registration'),
            Type.Literal('login'),
            Type.Literal('password_reset')
        ]),
    }),
    response: ApiResponseSchema(
        Type.Object({
            valid: Type.Boolean(),
            verificationToken: Type.Optional(Type.String({
                description: 'Temporary token for completing registration (15min validity)'
            })),
        })
    ),
} as const satisfies RouteContract;

/**
 * POST /exists - Check if account exists
 *
 * Checks if an email or phone number is already registered
 * Final path: /_auth/exists (prefix added from package.json)
 */
export const checkAccountExistsContract = {
    method: 'POST' as const,
    path: '/_auth/exists',
    body: Type.Object(
        {
            email: Type.Optional(Type.String({
                pattern: EMAIL_PATTERN,
                description: 'Email address to check'
            })),
            phone: Type.Optional(Type.String({
                pattern: PHONE_PATTERN,
                description: 'Phone number in E.164 format (e.g., +821012345678)'
            })),
        },
        {
            minProperties: 1,
            description: 'At least one of email or phone must be provided'
        }
    ),
    response: ApiResponseSchema(
        Type.Object(
            {
                exists: Type.Boolean({ description: 'Whether the account exists' }),
                identifier: Type.String({ description: 'The identifier that was checked' }),
                identifierType: Type.Union([
                    Type.Literal('email'),
                    Type.Literal('phone')
                ], { description: 'Type of identifier checked' }),
            }
        )
    ),
} as const satisfies RouteContract;

/**
 * POST /register - Register new user
 *
 * Register with email/phone and password, includes public key
 * Final path: /_auth/register (prefix added from package.json)
 */
export const registerContract = {
    method: 'POST' as const,
    path: '/_auth/register',
    body: Type.Object({
        email: Type.Optional(Type.String({
            pattern: EMAIL_PATTERN,
            description: 'Email address'
        })),
        phone: Type.Optional(Type.String({
            pattern: PHONE_PATTERN,
            description: 'Phone number in E.164 format'
        })),
        verificationToken: Type.String({
            description: 'Verification token obtained from /verify-code endpoint'
        }),
        password: Type.String({
            minLength: 8,
            description: 'User password (minimum 8 characters)'
        }),
        publicKey: Type.String({
            pattern: BASE64_PATTERN,
            description: 'Base64 encoded DER public key (SPKI format)'
        }),
        keyId: Type.String({
            pattern: UUID_PATTERN,
            description: 'Client-generated UUID v4 key identifier'
        }),
        fingerprint: Type.String({
            pattern: FINGERPRINT_PATTERN,
            description: 'SHA-256 fingerprint of public key (64 hex characters)'
        }),
        algorithm: Type.Union([
            Type.Literal('ES256'),
            Type.Literal('RS256')
        ], {
            description: 'Signing algorithm (ES256 recommended, RS256 for compatibility)'
        }),
        keySize: Type.Optional(Type.Number({
            description: 'Key size in bytes'
        })),
    }, {
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
} as const satisfies RouteContract;

/**
 * POST /login - User login
 *
 * Authenticate user with email/phone and password
 * Replaces existing key with new one
 * Final path: /_auth/login (prefix added from package.json)
 */
export const loginContract = {
    method: 'POST' as const,
    path: '/_auth/login',
    body: Type.Object({
        email: Type.Optional(Type.String({
            pattern: EMAIL_PATTERN,
            description: 'Email address'
        })),
        phone: Type.Optional(Type.String({
            pattern: PHONE_PATTERN,
            description: 'Phone number in E.164 format'
        })),
        password: Type.String({
            minLength: 1,
            description: 'User password'
        }),
        publicKey: Type.String({
            pattern: BASE64_PATTERN,
            description: 'Base64 encoded DER public key (SPKI format)'
        }),
        keyId: Type.String({
            pattern: UUID_PATTERN,
            description: 'Client-generated UUID v4 key identifier'
        }),
        fingerprint: Type.String({
            pattern: FINGERPRINT_PATTERN,
            description: 'SHA-256 fingerprint of public key (64 hex characters)'
        }),
        oldKeyId: Type.Optional(Type.String({
            pattern: UUID_PATTERN,
            description: 'Previous key ID to revoke (server-side cleanup)'
        })),
        algorithm: Type.Union([
            Type.Literal('ES256'),
            Type.Literal('RS256')
        ], {
            description: 'Signing algorithm (ES256 recommended, RS256 for compatibility)'
        }),
        keySize: Type.Optional(Type.Number({
            description: 'Key size in bytes'
        })),
    }, {
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
} as const satisfies RouteContract;

/**
 * POST /logout - Logout user
 *
 * Revokes current key (requires authentication)
 * Final path: /_auth/logout (prefix added from package.json)
 */
export const logoutContract = {
    method: 'POST' as const,
    path: '/_auth/logout',
    body: Type.Object({}),
    response: ApiResponseSchema(
        Type.Object({
            success: Type.Boolean(),
        })
    ),
} as const satisfies RouteContract;

/**
 * POST /keys/rotate - Rotate key
 *
 * Replace current key with new one (requires authentication)
 * Final path: /_auth/keys/rotate (prefix added from package.json)
 */
export const rotateKeyContract = {
    method: 'POST' as const,
    path: '/_auth/keys/rotate',
    body: Type.Object({
        publicKey: Type.String({
            pattern: BASE64_PATTERN,
            description: 'Base64 encoded DER public key (SPKI format)'
        }),
        keyId: Type.String({
            pattern: UUID_PATTERN,
            description: 'Client-generated UUID v4 key identifier'
        }),
        fingerprint: Type.String({
            pattern: FINGERPRINT_PATTERN,
            description: 'SHA-256 fingerprint of public key (64 hex characters)'
        }),
        algorithm: Type.Union([
            Type.Literal('ES256'),
            Type.Literal('RS256')
        ], {
            description: 'Signing algorithm (ES256 recommended, RS256 for compatibility)'
        }),
        keySize: Type.Optional(Type.Number({
            description: 'Key size in bytes'
        })),
    }),
    response: ApiResponseSchema(
        Type.Object({
            success: Type.Boolean(),
            keyId: Type.String(),
        })
    ),
} as const satisfies RouteContract;

/**
 * PUT /password - Change user password
 *
 * Allows authenticated users to change their password
 * Requires current password for verification
 * Final path: /_auth/password (prefix added from package.json)
 */
export const changePasswordContract = {
    method: 'PUT' as const,
    path: '/_auth/password',
    body: Type.Object({
        currentPassword: Type.String({
            minLength: 1,
            description: 'Current password for verification'
        }),
        newPassword: Type.String({
            minLength: 8,
            description: 'New password (minimum 8 characters)'
        }),
    }),
    response: ApiResponseSchema(
        Type.Object({
            success: Type.Boolean({ description: 'Whether password was changed successfully' }),
        })
    ),
} as const satisfies RouteContract;