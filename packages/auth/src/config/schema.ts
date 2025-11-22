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
            category: 'session',
            examples: [
                'my-super-secret-session-key-at-least-32-chars-long',
                'use-a-cryptographically-secure-random-string-here',
            ],
        }),
        key: 'SPFN_AUTH_SESSION_SECRET',
    },

    SPFN_AUTH_SESSION_TTL: {
        ...envString({
            description: 'Session TTL (time to live) - supports duration strings like \'7d\', \'12h\', \'45m\'',
            default: '7d',
            required: false,
            category: 'session',
            examples: ['7d', '30d', '12h', '45m', '3600'],
        }),
        key: 'SPFN_AUTH_SESSION_TTL',
    },

    // ============================================================================
    // JWT Configuration
    // ============================================================================
    SPFN_AUTH_JWT_SECRET: {
        ...envString({
            description: 'JWT signing secret for server-signed tokens (legacy mode)',
            default: 'dev-secret-key-change-in-production',
            required: false,
            category: 'jwt',
            examples: [
                'your-jwt-secret-key-here',
                'use-different-from-session-secret',
            ],
        }),
        key: 'SPFN_AUTH_JWT_SECRET',
    },

    SPFN_AUTH_JWT_EXPIRES_IN: {
        ...envString({
            description: 'JWT token expiration time (e.g., \'7d\', \'24h\', \'1h\')',
            default: '7d',
            required: false,
            category: 'jwt',
            examples: ['7d', '24h', '1h', '30m'],
        }),
        key: 'SPFN_AUTH_JWT_EXPIRES_IN',
    },

    // ============================================================================
    // Security Configuration
    // ============================================================================
    SPFN_AUTH_BCRYPT_SALT_ROUNDS: {
        ...envNumber({
            description: 'Bcrypt salt rounds (cost factor, higher = more secure but slower)',
            default: 10,
            required: false,
            category: 'security',
            examples: ['10', '12', '14'],
        }),
        key: 'SPFN_AUTH_BCRYPT_SALT_ROUNDS',
    },

    SPFN_AUTH_VERIFICATION_TOKEN_SECRET: {
        ...envString({
            description: 'Verification token secret for email verification, password reset, etc.',
            required: false,
            category: 'security',
            examples: [
                'your-verification-token-secret',
                'can-be-different-from-jwt-secret',
            ],
        }),
        key: 'SPFN_AUTH_VERIFICATION_TOKEN_SECRET',
    },

    // ============================================================================
    // Admin Account Configuration
    // ============================================================================
    SPFN_AUTH_ADMIN_ACCOUNTS: {
        ...envString({
            description: 'JSON array of admin accounts (recommended for multiple admins)',
            required: false,
            category: 'admin',
            examples: [
                '[{"email":"admin@example.com","password":"secure-pass","role":"admin"}]',
                '[{"email":"super@example.com","password":"pass1","role":"superadmin"},{"email":"admin@example.com","password":"pass2","role":"admin"}]',
            ],
        }),
        key: 'SPFN_AUTH_ADMIN_ACCOUNTS',
    },

    SPFN_AUTH_ADMIN_EMAILS: {
        ...envString({
            description: 'Comma-separated list of admin emails (legacy CSV format)',
            required: false,
            category: 'admin',
            examples: [
                'admin@example.com,user@example.com',
                'super@example.com,admin@example.com,user@example.com',
            ],
        }),
        key: 'SPFN_AUTH_ADMIN_EMAILS',
    },

    SPFN_AUTH_ADMIN_PASSWORDS: {
        ...envString({
            description: 'Comma-separated list of admin passwords (legacy CSV format)',
            required: false,
            category: 'admin',
            examples: [
                'admin-pass,user-pass',
                'super-pass,admin-pass,user-pass',
            ],
        }),
        key: 'SPFN_AUTH_ADMIN_PASSWORDS',
    },

    SPFN_AUTH_ADMIN_ROLES: {
        ...envString({
            description: 'Comma-separated list of admin roles (legacy CSV format)',
            required: false,
            category: 'admin',
            examples: [
                'admin,user',
                'superadmin,admin,user',
            ],
        }),
        key: 'SPFN_AUTH_ADMIN_ROLES',
    },

    SPFN_AUTH_ADMIN_EMAIL: {
        ...envString({
            description: 'Single admin email (simplest format)',
            required: false,
            category: 'admin',
            examples: ['admin@example.com'],
        }),
        key: 'SPFN_AUTH_ADMIN_EMAIL',
    },

    SPFN_AUTH_ADMIN_PASSWORD: {
        ...envString({
            description: 'Single admin password (simplest format)',
            required: false,
            category: 'admin',
            examples: ['secure-admin-password'],
        }),
        key: 'SPFN_AUTH_ADMIN_PASSWORD',
    },

    // ============================================================================
    // API Configuration
    // ============================================================================
    SPFN_API_URL: {
        ...envString({
            description: 'Base API URL for invitation links and other external-facing URLs',
            default: 'http://localhost:8790',
            required: false,
            category: 'api',
            examples: [
                'https://api.example.com',
                'http://localhost:8790',
            ],
        }),
        key: 'SPFN_API_URL',
    },

    // ============================================================================
    // Legacy Backward Compatibility (Deprecated)
    // ============================================================================
    SESSION_SECRET: {
        ...envString({
            description: '[DEPRECATED] Use SPFN_AUTH_SESSION_SECRET instead',
            required: false,
            category: 'legacy',
        }),
        key: 'SESSION_SECRET',
    },

    JWT_SECRET: {
        ...envString({
            description: '[DEPRECATED] Use SPFN_AUTH_JWT_SECRET instead',
            required: false,
            category: 'legacy',
        }),
        key: 'JWT_SECRET',
    },

    JWT_EXPIRES_IN: {
        ...envString({
            description: '[DEPRECATED] Use SPFN_AUTH_JWT_EXPIRES_IN instead',
            required: false,
            category: 'legacy',
        }),
        key: 'JWT_EXPIRES_IN',
    },

    BCRYPT_SALT_ROUNDS: {
        ...envNumber({
            description: '[DEPRECATED] Use SPFN_AUTH_BCRYPT_SALT_ROUNDS instead',
            required: false,
            category: 'legacy',
        }),
        key: 'BCRYPT_SALT_ROUNDS',
    },

    VERIFICATION_TOKEN_SECRET: {
        ...envString({
            description: '[DEPRECATED] Use SPFN_AUTH_VERIFICATION_TOKEN_SECRET instead',
            required: false,
            category: 'legacy',
        }),
        key: 'VERIFICATION_TOKEN_SECRET',
    },

    ADMIN_ACCOUNTS: {
        ...envString({
            description: '[DEPRECATED] Use SPFN_AUTH_ADMIN_ACCOUNTS instead',
            required: false,
            category: 'legacy',
        }),
        key: 'ADMIN_ACCOUNTS',
    },

    ADMIN_EMAILS: {
        ...envString({
            description: '[DEPRECATED] Use SPFN_AUTH_ADMIN_EMAILS instead',
            required: false,
            category: 'legacy',
        }),
        key: 'ADMIN_EMAILS',
    },

    ADMIN_PASSWORDS: {
        ...envString({
            description: '[DEPRECATED] Use SPFN_AUTH_ADMIN_PASSWORDS instead',
            required: false,
            category: 'legacy',
        }),
        key: 'ADMIN_PASSWORDS',
    },

    ADMIN_ROLES: {
        ...envString({
            description: '[DEPRECATED] Use SPFN_AUTH_ADMIN_ROLES instead',
            required: false,
            category: 'legacy',
        }),
        key: 'ADMIN_ROLES',
    },

    ADMIN_EMAIL: {
        ...envString({
            description: '[DEPRECATED] Use SPFN_AUTH_ADMIN_EMAIL instead',
            required: false,
            category: 'legacy',
        }),
        key: 'ADMIN_EMAIL',
    },

    ADMIN_PASSWORD: {
        ...envString({
            description: '[DEPRECATED] Use SPFN_AUTH_ADMIN_PASSWORD instead',
            required: false,
            category: 'legacy',
        }),
        key: 'ADMIN_PASSWORD',
    },
});

/**
 * Type-safe Auth environment variable keys
 */
export type AuthEnvKey = keyof typeof authEnvSchema;

/**
 * Get all Auth environment variable keys
 */
export const authEnvKeys = Object.keys(authEnvSchema) as AuthEnvKey[];