/**
 * Client-Key Authentication Provider
 *
 * 사용자별 비대칭 키 쌍을 사용한 인증 시스템
 * - Private Key: 클라이언트만 보유 (암호화된 쿠키)
 * - Public Key: 서버 DB + 3-Tier 캐싱
 */

import crypto from 'node:crypto';

import type { Redis } from 'ioredis';

import type {
    AuthProvider,
    ClientKeyAuthConfig,
    KeyMetadata,
    KeyStore,
    SignatureRequest,
} from '../../shared/types.js';

import {
    DEFAULT_NONCE_WINDOW,
    DEFAULT_TOKEN_EXPIRY,
    ERROR_MESSAGES,
} from '../../shared/constants.js';

import { generateKeyPair } from '../crypto.js';
import { verifySignature } from '../signer.js';
import { NonceManager, PublicKeyCache } from '../cache.js';

export interface ClientKeyAuthProviderOptions<TUser = any>
{
    /** Key storage interface */
    keyStore: KeyStore;

    /** Find user by ID */
    findUserById: (id: any) => Promise<TUser | null>;

    /** Validate credentials (email/password) */
    validateCredentials: (credentials: any) => Promise<TUser | null>;

    /** Redis instance for caching and nonce management */
    redis: Redis;

    /** Optional configuration */
    config?: ClientKeyAuthConfig;
}

/**
 * Client-Key Authentication Provider
 */
export class ClientKeyAuthProvider<TUser = any> implements AuthProvider<TUser>
{
    private keyStore: KeyStore;
    private findUserById: (id: any) => Promise<TUser | null>;
    private validateCredentials: (credentials: any) => Promise<TUser | null>;
    private publicKeyCache: PublicKeyCache;
    private nonceManager: NonceManager;
    private config: Required<ClientKeyAuthConfig>;

    constructor(options: ClientKeyAuthProviderOptions<TUser>)
    {
        this.keyStore = options.keyStore;
        this.findUserById = options.findUserById;
        this.validateCredentials = options.validateCredentials;

        this.config = {
            keySize: options.config?.keySize ?? 256,
            tokenExpiry: options.config?.tokenExpiry ?? DEFAULT_TOKEN_EXPIRY,
            nonceWindow: options.config?.nonceWindow ?? DEFAULT_NONCE_WINDOW,
            cache: {
                memoryTTL: options.config?.cache?.memoryTTL ?? 3600,
                redisTTL: options.config?.cache?.redisTTL ?? 3600,
            },
        };

        this.publicKeyCache = new PublicKeyCache({
            redis: options.redis,
            memoryTTL: this.config.cache.memoryTTL,
            redisTTL: this.config.cache.redisTTL,
        });

        this.nonceManager = new NonceManager(
            options.redis,
            this.config.nonceWindow
        );
    }

    /**
     * Register new user and generate key pair
     */
    async register(
        credentials: any,
        metadata?: KeyMetadata
    ): Promise<{ user: TUser; keyId: string; privateKey: string }>
    {
        const user = await this.validateCredentials(credentials);
        if (!user)
        {
            throw new Error(ERROR_MESSAGES.INVALID_CREDENTIALS);
        }

        const { publicKey, privateKey } = generateKeyPair();
        const keyId = crypto.randomUUID();

        await this.keyStore.savePublicKey(
            (user as any).id,
            keyId,
            publicKey,
            metadata
        );

        await this.publicKeyCache.set(keyId, publicKey);

        return { user, keyId, privateKey };
    }

    /**
     * Login existing user and generate new key pair
     */
    async login(
        credentials: any,
        metadata?: KeyMetadata
    ): Promise<{ user: TUser; keyId: string; privateKey: string }>
    {
        const user = await this.validateCredentials(credentials);
        if (!user)
        {
            throw new Error(ERROR_MESSAGES.INVALID_CREDENTIALS);
        }

        const { publicKey, privateKey } = generateKeyPair();
        const keyId = crypto.randomUUID();

        await this.keyStore.savePublicKey(
            (user as any).id,
            keyId,
            publicKey,
            metadata
        );

        await this.publicKeyCache.set(keyId, publicKey);

        return { user, keyId, privateKey };
    }

    /**
     * Verify request signature and return user
     */
    async verifySignature(request: SignatureRequest): Promise<TUser>
    {
        const isNew = await this.nonceManager.checkAndStore(request.nonce);
        if (!isNew)
        {
            throw new Error(ERROR_MESSAGES.REPLAY_ATTACK);
        }

        let publicKey = await this.publicKeyCache.get(request.keyId);

        if (!publicKey)
        {
            publicKey = await this.keyStore.getPublicKey(request.keyId);

            if (!publicKey)
            {
                throw new Error(ERROR_MESSAGES.KEY_NOT_FOUND);
            }

            await this.publicKeyCache.set(request.keyId, publicKey);
        }

        const isValid = await verifySignature(
            {
                method: request.method,
                url: request.url,
                body: request.body,
                timestamp: request.timestamp,
                nonce: request.nonce,
            },
            request.signature,
            publicKey,
            this.config.nonceWindow
        );

        if (!isValid)
        {
            throw new Error(ERROR_MESSAGES.INVALID_SIGNATURE);
        }

        const user = await this.findUserById((request as any).userId);
        if (!user)
        {
            throw new Error(ERROR_MESSAGES.UNAUTHORIZED);
        }

        return user;
    }

    /**
     * Revoke specific key
     */
    async revokeKey(keyId: string): Promise<void>
    {
        await this.keyStore.revokeKey(keyId);
        await this.publicKeyCache.delete(keyId);
    }

    /**
     * Revoke all keys for a user
     */
    async revokeAllKeys(userId: any): Promise<void>
    {
        if (!this.keyStore.getUserKeys)
        {
            throw new Error('getUserKeys not implemented in KeyStore');
        }

        const keys = await this.keyStore.getUserKeys(userId);

        for (const key of keys)
        {
            await this.revokeKey(key.keyId);
        }
    }

    /**
     * Rotate key for a user
     */
    async rotateKey(
        userId: any,
        oldKeyId: string
    ): Promise<{ keyId: string; privateKey: string }>
    {
        const { publicKey, privateKey } = generateKeyPair();
        const newKeyId = crypto.randomUUID();

        await this.keyStore.savePublicKey(userId, newKeyId, publicKey);

        await this.publicKeyCache.set(newKeyId, publicKey);

        await this.revokeKey(oldKeyId);

        return { keyId: newKeyId, privateKey };
    }

    /**
     * Destroy provider and cleanup resources
     */
    destroy(): void
    {
        this.publicKeyCache.destroy();
    }
}