/**
 * @spfn/auth - Common Request Schemas
 *
 * Reusable schemas for authentication API requests
 */

import { Type } from '@sinclair/typebox';

// ===== Regex Patterns =====

/**
 * Email regex pattern (RFC 5322 compliant)
 * Validates: local-part@domain.tld
 * - Local part: alphanumeric, dots, hyphens, underscores
 * - Domain: alphanumeric, hyphens, dots
 * - TLD: minimum 2 characters
 */
export const EMAIL_PATTERN = '^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$';

/**
 * Phone regex pattern (E.164 format)
 * Format: +[country code][number] (1-15 digits total)
 */
export const PHONE_PATTERN = '^\\+[1-9]\\d{1,14}$';

/**
 * SHA-256 fingerprint pattern (64 hex characters)
 */
export const FINGERPRINT_PATTERN = '^[a-f0-9]{64}$';

/**
 * UUID v4 pattern (8-4-4-4-12 format)
 */
export const UUID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

/**
 * Base64 pattern (DER encoded keys)
 * Matches standard Base64 with padding
 */
export const BASE64_PATTERN = '^[A-Za-z0-9+/]+=*$';

// ===== Common Field Schemas =====

/**
 * Email schema
 */
export const EmailSchema = Type.String({
    pattern: EMAIL_PATTERN,
    description: 'Email address'
});

/**
 * Phone schema (E.164 format)
 */
export const PhoneSchema = Type.String({
    pattern: PHONE_PATTERN,
    description: 'Phone number in E.164 format (e.g., +821012345678)'
});

/**
 * Target type enum
 */
export const TargetTypeSchema = Type.Union([
    Type.Literal('email'),
    Type.Literal('phone')
], {
    description: 'Type of target (email or phone)'
});

/**
 * Verification purpose enum
 */
export const VerificationPurposeSchema = Type.Union([
    Type.Literal('registration'),
    Type.Literal('login'),
    Type.Literal('password_reset')
], {
    description: 'Purpose of verification'
});

/**
 * Verification code schema (6-digit)
 */
export const VerificationCodeSchema = Type.String({
    minLength: 6,
    maxLength: 6,
    pattern: '^[0-9]{6}$',
    description: '6-digit verification code'
});

/**
 * Public key schema (Base64 DER)
 */
export const PublicKeySchema = Type.String({
    pattern: BASE64_PATTERN,
    description: 'Base64 encoded DER public key (SPKI format)'
});

/**
 * Key ID schema (UUID v4)
 */
export const KeyIdSchema = Type.String({
    pattern: UUID_PATTERN,
    description: 'Client-generated UUID v4 key identifier'
});

/**
 * Key fingerprint schema (SHA-256)
 */
export const FingerprintSchema = Type.String({
    pattern: FINGERPRINT_PATTERN,
    description: 'SHA-256 fingerprint of public key (64 hex characters)'
});

/**
 * Signing algorithm enum
 */
export const AlgorithmSchema = Type.Union([
    Type.Literal('ES256'),
    Type.Literal('RS256')
], {
    description: 'Signing algorithm (ES256 recommended, RS256 for compatibility)'
});

/**
 * Password schema (minimum 8 characters)
 */
export const PasswordSchema = Type.String({
    minLength: 8,
    description: 'User password (minimum 8 characters)'
});

// ===== Composite Schemas =====

/**
 * Common cryptographic key fields
 */
export const CryptoKeyFieldsSchema = Type.Object({
    publicKey: PublicKeySchema,
    keyId: KeyIdSchema,
    fingerprint: FingerprintSchema,
    algorithm: AlgorithmSchema,
    keySize: Type.Optional(Type.Number({
        description: 'Key size in bytes'
    }))
});