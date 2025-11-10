/**
 * @spfn/auth/adapters/nextjs
 *
 * Next.js Adapter for SPFN Auth
 * Next.js 전용 어댑터 (next/headers 사용)
 *
 * Provides:
 * - Auto-registered interceptors for seamless auth flow
 * - Session helpers for HttpOnly cookie management
 * - Auto-generated API functions
 *
 * @requires next >= 13.0.0
 */

// Re-export client
export { client } from '@/lib/api';

// Auto re-export all types from lib/api (automatically includes new endpoints)
export type * from '@/lib/api';

// Import base authApi and specific functions for wrapping
import { api as baseAuthApi } from '@/lib/api';
import { login as loginApi } from '@/lib/api/auth-login';
import { register as registerApi } from '@/lib/api/auth-register';
import { logout as logoutApi } from '@/lib/api/auth-logout';
import { rotateKey as rotateKeyApi } from '@/lib/api/auth-keys-rotate';

/**
 * Client-side login types (without key fields)
 */
export type ClientLoginParams = {
    body: {
        email?: string;
        phone?: string;
        password: string;
    };
};

/**
 * Client-side register types (without key fields)
 */
export type ClientRegisterParams = {
    body: {
        email?: string;
        phone?: string;
        password: string;
        verificationToken: string;
    };
};

/**
 * Login with email/password
 *
 * Interceptor automatically generates and injects publicKey fields
 */
export const login = async (params: ClientLoginParams) =>
{
    return loginApi({ body: params.body as any });
};

/**
 * Register new account
 *
 * Interceptor automatically generates and injects publicKey fields
 */
export const register = async (params: ClientRegisterParams) =>
{
    return registerApi({ body: params.body as any });
};

/**
 * Logout current session
 *
 * Interceptor automatically adds JWT authentication
 */
export const logout = async () =>
{
    return logoutApi({ body: {} as any });
};

/**
 * Rotate encryption keys
 *
 * Interceptor automatically generates new key pair and adds JWT authentication
 */
export const rotateKey = async () =>
{
    return rotateKeyApi({ body: {} as any });
};

/**
 * Auth API collection
 *
 * Combines all base API functions with Next.js-specific wrapped functions
 * Wrapped functions (login, register, logout, rotateKey) handle key generation/JWT automatically
 * Other functions are automatically included from baseAuthApi
 */
export const authApi = {
    ...baseAuthApi,
    // Override with wrapped versions (key handling + interceptors)
    login,
    register,
    logout,
    rotateKey,
} as const;