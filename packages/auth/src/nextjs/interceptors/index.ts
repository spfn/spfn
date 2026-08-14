/**
 * Auth Interceptors for Next.js Proxy
 *
 * Automatically registers interceptors for authentication flow
 *
 * Every rule whose path and method match runs, as a chain in this order — they
 * do not compete for a single match. Two of them share /_auth/signup/password on
 * purpose: signupLinkInterceptor supplies the setup secret and
 * loginRegisterInterceptor supplies the device key.
 *
 * Order matters - more specific interceptors first:
 * 1. signupLinkInterceptor - Most specific (verified-email signup only)
 * 2. loginRegisterInterceptor - Specific (login/register/signup password)
 * 3. keyRotationInterceptor - Specific (key rotation only)
 * 4. oauthUrlInterceptor - OAuth URL generation (key generation + state injection)
 * 5. generalAuthInterceptor - General (all authenticated requests)
 */

import { loginRegisterInterceptor } from './login-register';
import { generalAuthInterceptor } from './general-auth';
import { keyRotationInterceptor } from './key-rotation';
import { oauthUrlInterceptor, oauthFinalizeInterceptor } from './oauth';
import { signupLinkInterceptor } from './signup-link';

/**
 * All auth interceptors
 *
 * Execution order:
 * 1. signupLinkInterceptor - Handles verified-email signup (setup secret ↔ HttpOnly cookie)
 * 2. loginRegisterInterceptor - Handles login/register/signup password (key generation + session save)
 * 3. keyRotationInterceptor - Handles key rotation (new key generation + session update)
 * 4. oauthUrlInterceptor - Handles OAuth URL requests (key generation + state injection + pending session)
 * 5. oauthFinalizeInterceptor - Handles OAuth finalize (pending session → full session)
 * 6. generalAuthInterceptor - Handles all authenticated requests (session validation + JWT injection + session renewal)
 */
export const authInterceptors = [
    signupLinkInterceptor,
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
export { signupLinkInterceptor } from './signup-link';

// Deprecated: use generalAuthInterceptor instead
export { generalAuthInterceptor as authenticationInterceptor };
