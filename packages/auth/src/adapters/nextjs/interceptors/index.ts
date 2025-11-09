/**
 * Auth Interceptors for Next.js Proxy
 *
 * Automatically registers interceptors for authentication flow
 */

import { registerInterceptors } from '@spfn/core/client/nextjs';
import { loginRegisterInterceptor } from './login-register';
import { authenticationInterceptor } from './authentication';
import { keyRotationInterceptor } from './key-rotation';

/**
 * All auth interceptors
 *
 * Execution order:
 * 1. loginRegisterInterceptor - Handles login/register (key generation + session save)
 * 2. authenticationInterceptor - Handles authenticated requests (JWT injection + logout)
 * 3. keyRotationInterceptor - Handles key rotation (new key generation + session update)
 */
export const authInterceptors = [
    loginRegisterInterceptor,
    authenticationInterceptor,
    keyRotationInterceptor,
];

// Auto-register interceptors on import
registerInterceptors('auth', authInterceptors);

// Re-export individual interceptors for advanced usage
export { loginRegisterInterceptor } from './login-register';
export { authenticationInterceptor } from './authentication';
export { keyRotationInterceptor } from './key-rotation';