/**
 * Auth Interceptors for Next.js Proxy
 *
 * Automatically registers interceptors for authentication flow
 *
 * Order matters - more specific interceptors first:
 * 1. loginRegisterInterceptor - Most specific (login/register only)
 * 2. keyRotationInterceptor - Specific (key rotation only)
 * 3. generalAuthInterceptor - General (all authenticated requests)
 */

import { registerInterceptors } from '@spfn/core/client/nextjs';
import { loginRegisterInterceptor } from './login-register';
import { generalAuthInterceptor } from './general-auth';
import { keyRotationInterceptor } from './key-rotation';

/**
 * All auth interceptors
 *
 * Execution order:
 * 1. loginRegisterInterceptor - Handles login/register (key generation + session save)
 * 2. keyRotationInterceptor - Handles key rotation (new key generation + session update)
 * 3. generalAuthInterceptor - Handles all authenticated requests (session validation + JWT injection + session renewal)
 */
export const authInterceptors = [
    loginRegisterInterceptor,
    keyRotationInterceptor,
    generalAuthInterceptor,
];

// Auto-register interceptors on import
registerInterceptors('auth', authInterceptors);

// Re-export individual interceptors for advanced usage
export { loginRegisterInterceptor } from './login-register';
export { generalAuthInterceptor } from './general-auth';
export { keyRotationInterceptor } from './key-rotation';

// Deprecated: use generalAuthInterceptor instead
export { generalAuthInterceptor as authenticationInterceptor };