import "server-only";

// Import interceptors (triggers auto-registration)
import './interceptors';

// Interceptor exports (for advanced usage)
export {
    authInterceptors,
    loginRegisterInterceptor,
    generalAuthInterceptor,
    keyRotationInterceptor,
    // Deprecated: use generalAuthInterceptor
    authenticationInterceptor,
} from './interceptors';

export { RequireAuth } from './guards/require-auth';
export type { RequireAuthProps } from './guards/require-auth';

export { RequireRole } from './guards/require-role';
export type { RequireRoleProps } from './guards/require-role';

export { RequirePermission } from './guards/require-permission';
export type { RequirePermissionProps } from './guards/require-permission';

export { getUserRole, getUserPermissions, hasAnyRole, hasAnyPermission } from './guards/auth-utils';

// Session helpers
export {
    saveSession,
    getSession,
    clearSession,
    type SessionData,
    type PublicSession
} from './session-helpers';