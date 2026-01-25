/**
 * Auth Interceptors for Next.js Proxy
 *
 * Automatically registers interceptors for authentication flow
 *
 * Order matters - more specific interceptors first:
 * 1. loginRegisterInterceptor - Most specific (login/register only)
 * 2. keyRotationInterceptor - Specific (key rotation only)
 * 3. oauthUrlInterceptor - OAuth URL generation (key generation + state injection)
 * 4. generalAuthInterceptor - General (all authenticated requests)
 */

import { loginRegisterInterceptor } from './login-register';
import { generalAuthInterceptor } from './general-auth';
import { keyRotationInterceptor } from './key-rotation';
import { oauthUrlInterceptor, oauthFinalizeInterceptor } from './oauth';

/**
 * All auth interceptors
 *
 * Execution order:
 * 1. loginRegisterInterceptor - Handles login/register (key generation + session save)
 * 2. keyRotationInterceptor - Handles key rotation (new key generation + session update)
 * 3. oauthUrlInterceptor - Handles OAuth URL requests (key generation + state injection + pending session)
 * 4. oauthFinalizeInterceptor - Handles OAuth finalize (pending session → full session)
 * 5. generalAuthInterceptor - Handles all authenticated requests (session validation + JWT injection + session renewal)
 */
export const authInterceptors = [
    loginRegisterInterceptor,
    keyRotationInterceptor,
    oauthUrlInterceptor,
    oauthFinalizeInterceptor,
    generalAuthInterceptor,
];

export { loginRegisterInterceptor } from './login-register';
export { generalAuthInterceptor } from './general-auth';
export { keyRotationInterceptor } from './key-rotation';
export { oauthUrlInterceptor, oauthFinalizeInterceptor } from './oauth';

// Deprecated: use generalAuthInterceptor instead
export { generalAuthInterceptor as authenticationInterceptor };