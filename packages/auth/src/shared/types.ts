/**
 * Core types for @spfn/auth package
 */

/**
 * Key metadata stored with public keys
 */
export interface KeyMetadata
{
    /** User-Agent string from registration */
    device?: string;

    /** IP address when key was created */
    createdIp?: string;

    /** Last used IP address */
    lastUsedIp?: string;

    /** Last time this key was used */
    lastUsedAt?: Date;

    /** Custom fields */
    [key: string]: any;
}

/**
 * Key storage interface
 */
export interface KeyStore
{
    /**
     * Get public key by keyId
     */
    getPublicKey(keyId: string): Promise<string | null>;

    /**
     * Save public key to storage
     */
    savePublicKey(
        userId: any,
        keyId: string,
        publicKey: string,
        metadata?: KeyMetadata
    ): Promise<void>;

    /**
     * Revoke (invalidate) a key
     */
    revokeKey(keyId: string): Promise<void>;

    /**
     * Get all keys for a user (optional)
     */
    getUserKeys?(userId: any): Promise<
        Array<{
            keyId: string;
            publicKey: string;
            createdAt: Date;
            lastUsedAt?: Date;
            revokedAt?: Date;
            metadata?: KeyMetadata;
        }>
    >;
}

/**
 * Authentication provider interface
 */
export interface AuthProvider<TUser = any>
{
    /**
     * Register a new user and generate key pair
     */
    register(
        credentials: any,
        metadata?: KeyMetadata
    ): Promise<{
        user: TUser;
        keyId: string;
        privateKey: string;
    }>;

    /**
     * Login existing user and generate new key pair
     */
    login(
        credentials: any,
        metadata?: KeyMetadata
    ): Promise<{
        user: TUser;
        keyId: string;
        privateKey: string;
    }>;

    /**
     * Verify request signature and return user
     */
    verifySignature(request: SignatureRequest): Promise<TUser>;

    /**
     * Revoke specific key
     */
    revokeKey(keyId: string): Promise<void>;

    /**
     * Revoke all keys for a user
     */
    revokeAllKeys(userId: any): Promise<void>;

    /**
     * Rotate key for a user
     */
    rotateKey(
        userId: any,
        oldKeyId: string
    ): Promise<{
        keyId: string;
        privateKey: string;
    }>;
}

/**
 * Signature request data
 */
export interface SignatureRequest
{
    keyId: string;
    signature: string;
    timestamp: string;
    nonce: string;
    method: string;
    url: string;
    body: string | null;
}

/**
 * Signature data for signing
 */
export interface SignatureData
{
    method: string;
    url: string;
    body: string | null;
    timestamp: string;
    nonce: string;
}

/**
 * Signature result
 */
export interface SignatureResult
{
    signature: string;
    timestamp: string;
    nonce: string;
}

/**
 * Client-key auth provider configuration
 */
export interface ClientKeyAuthConfig
{
    /** ECDSA key size (always 256 for P-256 curve) */
    keySize?: 256;

    /** Token expiry in seconds */
    tokenExpiry?: number;

    /** Nonce validity window in seconds */
    nonceWindow?: number;

    /** Cache configuration */
    cache?: {
        /** Memory cache TTL in seconds */
        memoryTTL?: number;

        /** Redis cache TTL in seconds */
        redisTTL?: number;
    };
}

/**
 * Auth middleware options
 */
export interface AuthMiddlewareOptions<TUser = any>
{
    /** Required roles */
    roles?: string[];

    /** Required permissions */
    permissions?: string[];

    /** Custom authorization function */
    authorize?: (user: TUser, context: any) => boolean | Promise<boolean>;
}

/**
 * Encrypted private key data
 */
export interface EncryptedPrivateKey
{
    encrypted: string;
    iv: string;
    authTag: string;
}