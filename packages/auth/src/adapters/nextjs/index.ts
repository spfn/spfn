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
// Import interceptors (triggers auto-registration)
import './interceptors';

// Session helpers
export {
    saveSession,
    getSession,
    clearSession,
    type SessionData
} from './session-helpers';

// Interceptor exports (for advanced usage)
export {
    authInterceptors,
    loginRegisterInterceptor,
    authenticationInterceptor,
    keyRotationInterceptor,
} from './interceptors';

// Re-export types and simple API functions
export {
    client,
    // Types
    type SendVerificationCodeResponse,
    type SendVerificationCodeBody,
    type VerifyCodeResponse,
    type VerifyCodeBody,
    type CheckAccountExistsResponse,
    type CheckAccountExistsBody,
    type RegisterResponse,
    type LoginResponse,
    type LogoutResponse,
    type RotateKeyResponse,
    type ChangePasswordResponse,
    type ChangePasswordBody,
    type GetInvitationResponse,
    type GetInvitationParams,
    type CreateInvitationResponse,
    type CreateInvitationBody,
    type ListInvitationsResponse,
    type ListInvitationsQuery,
    type AcceptInvitationResponse,
    type AcceptInvitationBody,
    type CancelInvitationResponse,
    type CancelInvitationBody,
    type ResendInvitationResponse,
    type ResendInvitationBody,
    type DeleteInvitationResponse,
    type DeleteInvitationBody,
} from '@/lib/api';

// Import API functions
import { sendVerificationCode } from '@/lib/api/auth-codes';
import { verifyCode } from '@/lib/api/auth-codes-verify';
import { checkAccountExists } from '@/lib/api/auth-exists';
import { changePassword } from '@/lib/api/auth-password';
import { getInvitation, createInvitation, listInvitations } from '@/lib/api/auth-invitations';
import { acceptInvitation } from '@/lib/api/auth-invitations-accept';
import { cancelInvitation } from '@/lib/api/auth-invitations-cancel';
import { resendInvitation } from '@/lib/api/auth-invitations-resend';
import { deleteInvitation } from '@/lib/api/auth-invitations-delete';
import { login as loginApi } from '@/lib/api/auth-login';
import { register as registerApi } from '@/lib/api/auth-register';
import { logout as logoutApi } from '@/lib/api/auth-logout';
import { rotateKey as rotateKeyApi } from '@/lib/api/auth-keys-rotate';

// Re-export simple API functions (no key handling needed)
export { sendVerificationCode, verifyCode, checkAccountExists, changePassword };
export { getInvitation, createInvitation, listInvitations };
export { acceptInvitation, cancelInvitation, resendInvitation, deleteInvitation };

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
 */
export const authApi = {
    // Wrapped functions (key handling)
    login,
    register,
    logout,
    rotateKey,
    // Simple functions (no key handling)
    sendVerificationCode,
    verifyCode,
    checkAccountExists,
    changePassword,
    getInvitation,
    createInvitation,
    listInvitations,
    acceptInvitation,
    cancelInvitation,
    resendInvitation,
    deleteInvitation,
} as const;