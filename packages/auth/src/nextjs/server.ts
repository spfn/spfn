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
    type SessionData,
    type PublicSession,
    type SaveSessionOptions
} from './session-helpers';