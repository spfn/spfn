/**
 * Constants for @spfn/auth package
 */

/**
 * ECDSA curve name (P-256 provides 128-bit security level)
 */
export const ECDSA_CURVE = 'P-256';

/**
 * Default token expiry (7 days in seconds)
 */
export const DEFAULT_TOKEN_EXPIRY = 60 * 60 * 24 * 7;

/**
 * Default nonce validity window (60 seconds)
 */
export const DEFAULT_NONCE_WINDOW = 60;

/**
 * Default memory cache TTL (1 hour in seconds)
 */
export const DEFAULT_MEMORY_CACHE_TTL = 3600;

/**
 * Default Redis cache TTL (1 hour in seconds)
 */
export const DEFAULT_REDIS_CACHE_TTL = 3600;

/**
 * AES encryption algorithm
 */
export const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

/**
 * ECDSA signing algorithm (SHA-256)
 */
export const SIGNING_ALGORITHM = 'SHA256';

/**
 * Cookie name for encrypted private key
 */
export const COOKIE_NAME = 'auth_private_key';

/**
 * Cookie name for key ID
 */
export const COOKIE_KEY_ID = 'auth_key_id';

/**
 * Request header names
 */
export const HEADERS = {
    SIGNATURE: 'X-Signature',
    TIMESTAMP: 'X-Timestamp',
    NONCE: 'X-Nonce',
    KEY_ID: 'X-Key-Id',
} as const;

/**
 * Redis key prefixes
 */
export const REDIS_PREFIXES = {
    NONCE: 'nonce:',
    PUBLIC_KEY: 'pubkey:',
} as const;

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
    INVALID_SIGNATURE: 'Invalid signature',
    EXPIRED_REQUEST: 'Request expired',
    REPLAY_ATTACK: 'Replay attack detected',
    KEY_NOT_FOUND: 'Key not found',
    KEY_REVOKED: 'Key has been revoked',
    INVALID_CREDENTIALS: 'Invalid credentials',
    UNAUTHORIZED: 'Unauthorized',
    FORBIDDEN: 'Forbidden',
    INSUFFICIENT_ROLE: 'Insufficient role',
    INSUFFICIENT_PERMISSIONS: 'Insufficient permissions',
} as const;