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
