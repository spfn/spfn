/**
 * @spfn/auth - AuthClient for Next.js
 *
 * Client library for Next.js API Routes and Server Actions
 * Handles key generation, session management, and SPFN API communication
 *
 * Key Features:
 * - Automatic key pair generation (ES256/RS256)
 * - Encrypted session storage (Jose JWE)
 * - Key rotation support
 * - httpOnly cookie management
 */

import { cookies } from 'next/headers.js';
import { generateKeyPair, generateClientToken } from '@/lib/crypto';
import { sealSession, unsealSession, type SessionData } from '@/lib/session';

export interface AuthClientConfig
{
    /**
     * SPFN API base URL
     */
    apiUrl: string;

    /**
     * Cookie name prefix (default: 'spfn')
     */
    cookiePrefix?: string;

    /**
     * Session max age in seconds (default: 7 days)
     */
    sessionMaxAge?: number;

    /**
     * Key algorithm (default: 'ES256')
     */
    algorithm?: 'ES256' | 'RS256';

    /**
     * Auto rotate keys before expiry (default: true)
     */
    autoRotateKeys?: boolean;

    /**
     * Key rotation period in days (default: 90)
     */
    keyRotationDays?: number;
}

export class AuthClient
{
    private config: Required<AuthClientConfig>;

    constructor(config: AuthClientConfig)
    {
        this.config = {
            cookiePrefix: 'spfn',
            sessionMaxAge: 60 * 60 * 24 * 7, // 7 days
            algorithm: 'ES256',
            autoRotateKeys: true,
            keyRotationDays: 90,
            ...config,
        };
    }

    /**
     * Register new user with email/password
     *
     * Flow:
     * 1. Generate new key pair (ES256/RS256)
     * 2. Send publicKey to SPFN API
     * 3. Store privateKey in encrypted session cookie
     *
     * @param params - Registration parameters
     * @returns User data with userId
     */
    async register(params: {
        email: string;
        password: string;
        verificationCode?: string;
    }): Promise<{ userId: string; email: string }>
    {
        // 1. Generate key pair
        const { privateKey, publicKey, keyId, fingerprint, algorithm } =
            generateKeyPair(this.config.algorithm);

        // 2. Call SPFN API
        const response = await fetch(`${this.config.apiUrl}/_auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...params,
                publicKey,
                keyId,
                fingerprint,
                algorithm,
                keySize: Buffer.from(publicKey, 'base64').length,
            }),
        });

        if (!response.ok)
        {
            const error = await response.json();
            throw new Error(error.error?.message || 'Registration failed');
        }

        const data = await response.json();

        // 3. Store session
        await this.storeSession({
            userId: data.data.userId,
            privateKey,
            keyId,
            algorithm,
        });

        return data.data;
    }

    /**
     * Login with email/password (replaces existing key)
     *
     * Flow:
     * 1. Get old keyId if exists (for server-side revocation)
     * 2. Generate new key pair
     * 3. Send publicKey + oldKeyId to SPFN API
     * 4. Server revokes old key, stores new publicKey
     * 5. Store new session with privateKey
     *
     * @param params - Login credentials
     * @returns User data with passwordChangeRequired flag
     */
    async login(params: {
        email: string;
        password: string;
    }): Promise<{ userId: string; email: string; passwordChangeRequired: boolean }>
    {
        // 1. Get old key ID if exists
        const oldSession = await this.getSession().catch(() => null);
        const oldKeyId = oldSession?.keyId;

        // 2. Generate new key pair
        const { privateKey, publicKey, keyId, fingerprint, algorithm } =
            generateKeyPair(this.config.algorithm);

        // 3. Call SPFN API
        const response = await fetch(`${this.config.apiUrl}/_auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...params,
                publicKey,
                keyId,
                fingerprint,
                oldKeyId,
                algorithm,
                keySize: Buffer.from(publicKey, 'base64').length,
            }),
        });

        if (!response.ok)
        {
            const error = await response.json();
            throw new Error(error.error?.message || 'Login failed');
        }

        const data = await response.json();

        // 4. Store new session
        await this.storeSession({
            userId: data.data.userId,
            privateKey,
            keyId,
            algorithm,
        });

        return data.data;
    }

    /**
     * Logout (revoke current key)
     *
     * Flow:
     * 1. Create token with current key
     * 2. Call SPFN API to revoke key
     * 3. Clear local session (always, even if API fails)
     *
     * Note: Always clears local session regardless of API success
     */
    async logout(): Promise<void>
    {
        try
        {
            // Get current session
            const session = await this.getSession();

            // Create token for logout request
            const token = await this.createToken({ action: 'logout' });

            // Call SPFN API to revoke key
            await fetch(`${this.config.apiUrl}/_auth/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-Key-Id': session.keyId,
                },
            });
        }
        catch (err)
        {
            console.error('Logout API call failed:', err);
        }
        finally
        {
            // Always clear local session
            await this.clearSession();
        }
    }

    /**
     * Rotate key (generate new key pair)
     *
     * Flow:
     * 1. Get current session
     * 2. Generate new key pair
     * 3. Create token with **current** key for authentication
     * 4. Send new publicKey to SPFN API
     * 5. Server revokes old key, stores new publicKey
     * 6. Store new session
     *
     * @returns New keyId
     */
    async rotateKey(): Promise<{ keyId: string }>
    {
        // 1. Get current session
        const currentSession = await this.getSession();

        // 2. Generate new key pair
        const { privateKey, publicKey, keyId, fingerprint, algorithm } =
            generateKeyPair(this.config.algorithm);

        // 3. Create token with current key
        const token = await this.createToken({ action: 'rotate_key' });

        // 4. Call SPFN API
        const response = await fetch(`${this.config.apiUrl}/_auth/keys/rotate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Key-Id': currentSession.keyId,
            },
            body: JSON.stringify({
                publicKey,
                keyId,
                fingerprint,
                algorithm,
                keySize: Buffer.from(publicKey, 'base64').length,
            }),
        });

        if (!response.ok)
        {
            const error = await response.json();
            throw new Error(error.error?.message || 'Key rotation failed');
        }

        // 5. Store new session
        await this.storeSession({
            userId: currentSession.userId,
            privateKey,
            keyId,
            algorithm,
        });

        return { keyId };
    }

    /**
     * Create signed JWT token for API requests
     *
     * Creates a short-lived (15min) JWT signed with user's private key
     * Server verifies with stored public key
     *
     * @param payload - Additional payload data
     * @returns Signed JWT token
     */
    async createToken(payload: Record<string, any>): Promise<string>
    {
        const session = await this.getSession();

        return generateClientToken(
            {
                ...payload,
                userId: session.userId,
                keyId: session.keyId,
                timestamp: Date.now(),
            },
            session.privateKey,
            session.algorithm,
            { expiresIn: '15m' }
        );
    }

    /**
     * Make authenticated request to SPFN API
     *
     * Convenience method that automatically:
     * - Creates JWT token
     * - Adds Authorization header
     * - Adds X-Key-Id header
     *
     * @param path - API path (e.g., '/users/me')
     * @param options - Fetch options
     * @returns Fetch Response
     */
    async fetch(path: string, options?: RequestInit): Promise<Response>
    {
        const session = await this.getSession();

        const token = await this.createToken({
            method: options?.method || 'GET',
            path,
        });

        return fetch(`${this.config.apiUrl}${path}`, {
            ...options,
            headers: {
                ...options?.headers,
                'Authorization': `Bearer ${token}`,
                'X-Key-Id': session.keyId,
            },
        });
    }

    /**
     * Get current session
     *
     * @returns Decrypted session data
     * @throws Error if not authenticated
     */
    async getSession(): Promise<SessionData>
    {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get(`${this.config.cookiePrefix}_session`)?.value;

        if (!sessionCookie)
        {
            throw new Error('Not authenticated');
        }

        return await unsealSession(sessionCookie);
    }

    /**
     * Check if user is authenticated
     *
     * @returns True if valid session exists
     */
    async isAuthenticated(): Promise<boolean>
    {
        try
        {
            await this.getSession();
            return true;
        }
        catch
        {
            return false;
        }
    }

    /**
     * Store session in encrypted cookie
     *
     * Cookie attributes:
     * - httpOnly: JavaScript cannot access (XSS protection)
     * - secure: HTTPS only in production
     * - sameSite: 'strict' (CSRF protection)
     * - maxAge: 7 days default
     *
     * @param data - Session data to store
     */
    private async storeSession(data: SessionData): Promise<void>
    {
        const sealed = await sealSession(data, this.config.sessionMaxAge);

        const cookieStore = await cookies();
        cookieStore.set(`${this.config.cookiePrefix}_session`, sealed, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: this.config.sessionMaxAge,
            path: '/',
        });
    }

    /**
     * Clear session cookie
     */
    private async clearSession(): Promise<void>
    {
        const cookieStore = await cookies();
        cookieStore.delete(`${this.config.cookiePrefix}_session`);
    }
}

/**
 * Create AuthClient instance with default config
 *
 * Automatically loads API URL from environment:
 * - SPFN_API_URL (preferred)
 * - NEXT_PUBLIC_API_URL (fallback)
 *
 * @param config - Optional config overrides
 * @returns AuthClient instance
 *
 * @example
 * ```typescript
 * // In Next.js Server Action
 * const auth = createAuthClient();
 * await auth.login({ email, password });
 * ```
 */
export function createAuthClient(config?: Partial<AuthClientConfig>): AuthClient
{
    const apiUrl = config?.apiUrl || process.env.SPFN_API_URL || process.env.NEXT_PUBLIC_API_URL;

    if (!apiUrl)
    {
        throw new Error('SPFN_API_URL or NEXT_PUBLIC_API_URL environment variable is required');
    }

    return new AuthClient({
        apiUrl,
        ...config,
    });
}