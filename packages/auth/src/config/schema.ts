/**
 * Auth Environment Variable Schema
 *
 * Centralized schema definition for all environment variables used in @spfn/auth.
 * This provides type safety, validation, and documentation for Auth configuration.
 *
 * @module config/schema
 */

import {
    defineEnvSchema,
    envString,
    envNumber,
    createSecureSecretParser,
    createPasswordParser,
} from '@spfn/core/env';

/**
 * Auth environment variable schema
 *
 * Defines all Auth environment variables with:
 * - Type information
 * - Default values
 * - Validation rules
 * - Documentation
 *
 * @example
 * ```typescript
 * import { authEnvSchema } from '@spfn/auth/config';
 *
 * // Access schema information
 * console.log(authEnvSchema.SPFN_AUTH_SESSION_SECRET.description);
 * console.log(authEnvSchema.SPFN_AUTH_JWT_EXPIRES_IN.default);
 * ```
 */
export const authEnvSchema = defineEnvSchema({
    // ============================================================================
    // Session Configuration
    // ============================================================================
    SPFN_AUTH_SESSION_SECRET: {
        ...envString({
            description: 'Session encryption secret (minimum 32 characters for AES-256)',
            required: true,
            fallbackKeys: ['SESSION_SECRET'],
            validator: createSecureSecretParser({
                minLength: 32,
                minUniqueChars: 16,
                minEntropy: 3.5,
            }),
            sensitive: true,
            nextjs: true, // Required for Next.js RSC session validation
            examples: [
                'my-super-secret-session-key-at-least-32-chars-long',
                'use-a-cryptographically-secure-random-string-here',
            ],
        }),
    },

    SPFN_AUTH_SESSION_TTL: {
        ...envString({
            description: 'Session TTL (time to live) - supports duration strings like \'7d\', \'12h\', \'45m\'',
            default: '7d',
            required: false,
            nextjs: true, // May be needed for session validation in Next.js RSC
            examples: ['7d', '30d', '12h', '45m', '3600'],
        }),
    },

    // ============================================================================
    // JWT Configuration
    // ============================================================================
    SPFN_AUTH_JWT_SECRET: {
        ...envString({
            description: 'JWT signing secret for server-signed tokens (legacy mode)',
            default: 'dev-secret-key-change-in-production',
            required: false,
            examples: [
                'your-jwt-secret-key-here',
                'use-different-from-session-secret',
            ],
        }),
    },

    SPFN_AUTH_JWT_EXPIRES_IN: {
        ...envString({
            description: 'JWT token expiration time (e.g., \'7d\', \'24h\', \'1h\')',
            default: '7d',
            required: false,
            examples: ['7d', '24h', '1h', '30m'],
        }),
    },

    // ============================================================================
    // Security Configuration
    // ============================================================================
    SPFN_AUTH_BCRYPT_SALT_ROUNDS: {
        ...envNumber({
            description: 'Bcrypt salt rounds (cost factor, higher = more secure but slower)',
            default: 10,
            required: false,
            examples: [10, 12, 14],
        }),
        key: 'SPFN_AUTH_BCRYPT_SALT_ROUNDS',
    },

    SPFN_AUTH_VERIFICATION_TOKEN_SECRET: {
        ...envString({
            description: 'Verification token secret for email verification, password reset, etc.',
            required: true,
            examples: [
                'your-verification-token-secret',
                'can-be-different-from-jwt-secret',
            ],
        }),
    },

    // ============================================================================
    // Admin Account Configuration
    // ============================================================================
    SPFN_AUTH_ADMIN_ACCOUNTS: {
        ...envString({
            description: 'JSON array of admin accounts (recommended for multiple admins)',
            required: false,
            examples: [
                '[{"email":"admin@example.com","password":"secure-pass","role":"admin"}]',
                '[{"email":"super@example.com","password":"pass1","role":"superadmin"},{"email":"admin@example.com","password":"pass2","role":"admin"}]',
            ],
        }),
    },

    SPFN_AUTH_ADMIN_EMAILS: {
        ...envString({
            description: 'Comma-separated list of admin emails (legacy CSV format)',
            required: false,
            examples: [
                'admin@example.com,user@example.com',
                'super@example.com,admin@example.com,user@example.com',
            ],
        }),
    },

    SPFN_AUTH_ADMIN_PASSWORDS: {
        ...envString({
            description: 'Comma-separated list of admin passwords (legacy CSV format)',
            required: false,
            examples: [
                'admin-pass,user-pass',
                'super-pass,admin-pass,user-pass',
            ],
        }),
    },

    SPFN_AUTH_ADMIN_ROLES: {
        ...envString({
            description: 'Comma-separated list of admin roles (legacy CSV format)',
            required: false,
            examples: [
                'admin,user',
                'superadmin,admin,user',
            ],
        }),
    },

    SPFN_AUTH_ADMIN_EMAIL: {
        ...envString({
            description: 'Single admin email (simplest format)',
            required: false,
            examples: ['admin@example.com'],
        }),
    },

    SPFN_AUTH_ADMIN_PASSWORD: {
        ...envString({
            description: 'Single admin password (simplest format)',
            required: false,
            validator: createPasswordParser({
                minLength: 8,
                requireUppercase: true,
                requireLowercase: true,
                requireNumber: true,
                requireSpecial: true,
            }),
            sensitive: true,
            examples: ['SecureAdmin123!'],
        }),
    },

    // ============================================================================
    // API Configuration
    // ============================================================================
    SPFN_API_URL: {
        ...envString({
            description: 'Base API URL for invitation links and other external-facing URLs',
            default: 'http://localhost:8790',
            required: false,
            examples: [
                'https://api.example.com',
                'http://localhost:8790',
            ],
        }),
    },

    // ============================================================================
    // AWS SNS Configuration (SMS)
    // ============================================================================
    SPFN_AUTH_AWS_REGION: {
        ...envString({
            description: 'AWS region for SNS service',
            default: 'ap-northeast-2',
            required: false,
            examples: ['ap-northeast-2', 'us-east-1', 'eu-west-1'],
        }),
    },

    SPFN_AUTH_AWS_SNS_ACCESS_KEY_ID: {
        ...envString({
            description: 'AWS SNS access key ID (optional, uses default credentials chain if not provided)',
            required: false,
            sensitive: true,
            examples: ['AKIAIOSFODNN7EXAMPLE'],
        }),
    },

    SPFN_AUTH_AWS_SNS_SECRET_ACCESS_KEY: {
        ...envString({
            description: 'AWS SNS secret access key (optional, uses default credentials chain if not provided)',
            required: false,
            sensitive: true,
            examples: ['wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'],
        }),
    },

    SPFN_AUTH_AWS_SNS_SENDER_ID: {
        ...envString({
            description: 'SMS sender ID displayed to recipients (max 11 characters, alphanumeric)',
            required: false,
            examples: ['MyApp', 'YourBrand'],
        }),
    },

    // ============================================================================
    // AWS SES Configuration (Email)
    // ============================================================================
    SPFN_AUTH_AWS_SES_ACCESS_KEY_ID: {
        ...envString({
            description: 'AWS SES access key ID (optional, uses default credentials chain if not provided)',
            required: false,
            sensitive: true,
            examples: ['AKIAIOSFODNN7EXAMPLE'],
        }),
    },

    SPFN_AUTH_AWS_SES_SECRET_ACCESS_KEY: {
        ...envString({
            description: 'AWS SES secret access key (optional, uses default credentials chain if not provided)',
            required: false,
            sensitive: true,
            examples: ['wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'],
        }),
    },

    SPFN_AUTH_AWS_SES_FROM_EMAIL: {
        ...envString({
            description: 'Sender email address (must be verified in AWS SES)',
            required: false,
            examples: ['noreply@example.com', 'auth@yourdomain.com'],
        }),
    },

    SPFN_AUTH_AWS_SES_FROM_NAME: {
        ...envString({
            description: 'Sender display name',
            required: false,
            examples: ['MyApp', 'Your Company'],
        }),
    },

    SPFN_APP_URL: {
        ...envString({
            description: 'Next.js application URL. Used for OAuth callback redirects.',
            default: 'http://localhost:3000',
            required: false,
            examples: [
                'https://app.example.com',
                'http://localhost:3000',
            ],
        }),
    },

    // ============================================================================
    // OAuth Configuration - Google
    // ============================================================================
    SPFN_AUTH_GOOGLE_CLIENT_ID: {
        ...envString({
            description: 'Google OAuth 2.0 Client ID. When set, Google OAuth routes are automatically enabled.',
            required: false,
            examples: ['123456789-abc123.apps.googleusercontent.com'],
        }),
    },

    SPFN_AUTH_GOOGLE_CLIENT_SECRET: {
        ...envString({
            description: 'Google OAuth 2.0 Client Secret',
            required: false,
            sensitive: true,
            examples: ['GOCSPX-abcdefghijklmnop'],
        }),
    },

    SPFN_AUTH_GOOGLE_SCOPES: {
        ...envString({
            description: 'Comma-separated Google OAuth scopes. Defaults to "email,profile" if not set.',
            required: false,
            examples: [
                'email,profile',
                'email,profile,https://www.googleapis.com/auth/gmail.readonly',
                'email,profile,https://www.googleapis.com/auth/calendar.readonly',
            ],
        }),
    },

    SPFN_AUTH_GOOGLE_REDIRECT_URI: {
        ...envString({
            description: 'Google OAuth callback URL. Defaults to {SPFN_API_URL}/_auth/oauth/google/callback',
            required: false,
            examples: [
                'https://api.example.com/_auth/oauth/google/callback',
                'http://localhost:8790/_auth/oauth/google/callback',
            ],
        }),
    },

    SPFN_AUTH_OAUTH_SUCCESS_URL: {
        ...envString({
            description: 'OAuth callback page URL. This page should use OAuthCallback component to finalize session.',
            required: false,
            default: '/auth/callback',
            examples: [
                '/auth/callback',
                'https://app.example.com/auth/callback',
            ],
        }),
    },

    SPFN_AUTH_OAUTH_ERROR_URL: {
        ...envString({
            description: 'URL to redirect after OAuth error. Use {error} placeholder for error message.',
            required: false,
            default: 'http://localhost:3000/auth/error?error={error}',
            examples: [
                'https://app.example.com/auth/error?error={error}',
                'http://localhost:3000/auth/error?error={error}',
            ],
        }),
    },
});