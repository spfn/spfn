import "server-only";

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
    // Pending session (OAuth)
    sealPendingSession,
    unsealPendingSession,
    getPendingSession,
    clearPendingSession,
    type SessionData,
    type PublicSession,
    type SaveSessionOptions,
    type PendingSessionData,
} from './session-helpers';

// OAuth handlers
export {
    createOAuthCallbackHandler,
    type OAuthCallbackOptions,
} from './oauth-handlers';